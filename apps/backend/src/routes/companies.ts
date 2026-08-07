import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { $Enums } from '../generated/prisma/client'
import { requireAuth } from '../middleware/auth'
import { requireRole } from '../middleware/roles'

const MAX_NAME_LENGTH = 100

/**
 * Shared shape for a member in company responses. Never leaks the password hash.
 */
const MEMBER_SELECT = {
  id: true,
  role: true,
  joinedAt: true,
  user: {
    select: { id: true, name: true, email: true, role: true },
  },
} as const

function isMembershipRole(role: string): role is $Enums.MembershipRole {
  return role === 'MEMBER' || role === 'LEAD'
}

async function createCompany(request: FastifyRequest, reply: FastifyReply) {
  const { name, description, city } = request.body as {
    name?: string
    description?: string
    city?: string
  }

  if (!name || !name.trim()) {
    return reply.status(400).send({ error: 'name is required' })
  }

  if (name.trim().length > MAX_NAME_LENGTH) {
    return reply.status(400).send({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` })
  }

  // The creator becomes a LEAD member. Nested create keeps the company and its
  // first membership in a single transaction, so we can never end up with an
  // ownerless company.
  const company = await request.server.prisma.company.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      city: city?.trim() || null,
      memberships: {
        create: {
          userId: request.user!.id,
          role: $Enums.MembershipRole.LEAD,
        },
      },
    },
    include: { memberships: { select: MEMBER_SELECT } },
  })

  return reply.status(201).send(company)
}

async function getCompany(request: FastifyRequest, reply: FastifyReply) {
  // requireRole already proved the caller is a member, so the company exists.
  const { id } = request.params as { id: string }

  const company = await request.server.prisma.company.findUnique({
    where: { id },
    include: {
      memberships: {
        select: MEMBER_SELECT,
        orderBy: { joinedAt: 'asc' },
      },
    },
  })

  if (!company) {
    return reply.status(404).send({ error: 'Company not found' })
  }

  return reply.status(200).send(company)
}

async function listCompanies(request: FastifyRequest, reply: FastifyReply) {
  const { city } = request.query as { city?: string }

  const companies = await request.server.prisma.company.findMany({
    where: city ? { city } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { memberships: true } },
    },
  })

  // Flatten Prisma's _count into the memberCount the city directory expects.
  return reply.status(200).send(
    companies.map(({ _count, ...company }) => ({
      ...company,
      memberCount: _count.memberships,
    })),
  )
}

/** Company management — LEAD only. */
async function updateCompany(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }
  const { name, description, city } = request.body as {
    name?: string
    description?: string
    city?: string
  }

  if (name !== undefined) {
    if (!name.trim()) {
      return reply.status(400).send({ error: 'name cannot be empty' })
    }
    if (name.trim().length > MAX_NAME_LENGTH) {
      return reply.status(400).send({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` })
    }
  }

  const company = await request.server.prisma.company.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description.trim() || null }),
      ...(city !== undefined && { city: city.trim() || null }),
    },
    include: { memberships: { select: MEMBER_SELECT, orderBy: { joinedAt: 'asc' } } },
  })

  return reply.status(200).send(company)
}

/** Add a user to the company — LEAD only. */
async function addMember(request: FastifyRequest, reply: FastifyReply) {
  const { id: companyId } = request.params as { id: string }
  const { userId, role } = request.body as { userId?: string; role?: string }

  if (!userId) {
    return reply.status(400).send({ error: 'userId is required' })
  }

  if (role && !isMembershipRole(role)) {
    return reply.status(400).send({ error: 'role must be MEMBER or LEAD' })
  }

  const user = await request.server.prisma.user.findUnique({ where: { id: userId } })

  if (!user) {
    return reply.status(404).send({ error: 'User not found' })
  }

  try {
    const membership = await request.server.prisma.membership.create({
      data: {
        userId,
        companyId,
        role: (role as $Enums.MembershipRole) || $Enums.MembershipRole.MEMBER,
      },
      select: MEMBER_SELECT,
    })

    return reply.status(201).send(membership)
  } catch (err: any) {
    if (err.code === 'P2002') {
      return reply.status(409).send({ error: 'User is already a member of this company' })
    }
    throw err
  }
}

/** Member promotion / demotion — LEAD only. */
async function updateMemberRole(request: FastifyRequest, reply: FastifyReply) {
  const { id: companyId, userId } = request.params as { id: string; userId: string }
  const { role } = request.body as { role?: string }

  if (!role || !isMembershipRole(role)) {
    return reply.status(400).send({ error: 'role must be MEMBER or LEAD' })
  }

  const target = await request.server.prisma.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
  })

  if (!target) {
    return reply.status(404).send({ error: 'Membership not found' })
  }

  // Refuse to demote the last LEAD — that would leave the company unmanageable,
  // with no one able to pass the requireRole('LEAD') guard ever again.
  if (target.role === 'LEAD' && role === 'MEMBER') {
    const leadCount = await request.server.prisma.membership.count({
      where: { companyId, role: 'LEAD' },
    })

    if (leadCount <= 1) {
      return reply.status(400).send({ error: 'Company must have at least one LEAD' })
    }
  }

  const membership = await request.server.prisma.membership.update({
    where: { userId_companyId: { userId, companyId } },
    data: { role },
    select: MEMBER_SELECT,
  })

  return reply.status(200).send(membership)
}

export default async function companyRoutes(fastify: FastifyInstance) {
  // Every company route needs a logged-in user.
  fastify.addHook('preHandler', requireAuth)

  const requireMember = requireRole($Enums.MembershipRole.MEMBER)
  const requireLead = requireRole($Enums.MembershipRole.LEAD)

  fastify.post('/', createCompany)
  fastify.get('/', listCompanies)

  fastify.get('/:id', { preHandler: requireMember }, getCompany)
  fastify.patch('/:id', { preHandler: requireLead }, updateCompany)
  fastify.post('/:id/members', { preHandler: requireLead }, addMember)
  fastify.patch('/:id/members/:userId', { preHandler: requireLead }, updateMemberRole)
}
