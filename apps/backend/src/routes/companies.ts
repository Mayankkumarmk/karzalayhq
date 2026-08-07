import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { $Enums } from '../generated/prisma/client'

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

async function createCompany(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.userId) {
    return reply.status(401).send({ error: 'Not authenticated' })
  }

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
          userId: request.session.userId,
          role: $Enums.MembershipRole.LEAD,
        },
      },
    },
    include: { memberships: { select: MEMBER_SELECT } },
  })

  return reply.status(201).send(company)
}

async function getCompany(request: FastifyRequest, reply: FastifyReply) {
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

export default async function companyRoutes(fastify: FastifyInstance) {
  fastify.post('/', createCompany)
  fastify.get('/', listCompanies)
  fastify.get('/:id', getCompany)
}
