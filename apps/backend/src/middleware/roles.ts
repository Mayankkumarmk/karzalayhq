import { FastifyRequest, FastifyReply } from 'fastify'
import { $Enums } from '../generated/prisma/client'

/**
 * Membership roles are hierarchical: a LEAD satisfies any requirement a MEMBER
 * satisfies. Higher number == more authority.
 */
const ROLE_LEVEL: Record<$Enums.MembershipRole, number> = {
  MEMBER: 1,
  LEAD: 2,
}

export interface RequestMembership {
  id: string
  companyId: string
  role: $Enums.MembershipRole
}

declare module 'fastify' {
  interface FastifyRequest {
    membership?: RequestMembership
  }
}

/**
 * Pulls the target company id from wherever the route puts it. Routes nested
 * under /companies/:id use `id`; flat routes pass `companyId` in params, body,
 * or query.
 */
function resolveCompanyId(request: FastifyRequest): string | undefined {
  const params = (request.params ?? {}) as Record<string, string | undefined>
  const query = (request.query ?? {}) as Record<string, string | undefined>
  const body = (request.body ?? {}) as Record<string, unknown>

  const fromBody = typeof body.companyId === 'string' ? body.companyId : undefined

  return params.companyId || params.id || fromBody || query.companyId
}

/**
 * Fastify preHandler factory. Requires the caller to hold a membership in the
 * target company at `role` or above, and attaches `request.membership`.
 *
 * Must run after requireAuth.
 *
 * Responses:
 *   401 — no authenticated user (requireAuth was skipped or failed)
 *   400 — the route gave us no company to check against
 *   403 — not a member of that company, or membership rank too low
 *
 * A company that does not exist also yields 403 rather than 404: you are not a
 * member of it either way, and this keeps the endpoint from confirming which
 * company ids are real.
 */
export function requireRole(role: $Enums.MembershipRole) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' })
    }

    const companyId = resolveCompanyId(request)

    if (!companyId) {
      return reply.status(400).send({ error: 'companyId is required' })
    }

    const membership = await request.server.prisma.membership.findUnique({
      where: { userId_companyId: { userId: request.user.id, companyId } },
      select: { id: true, companyId: true, role: true },
    })

    if (!membership) {
      return reply.status(403).send({ error: 'Not a member of this company' })
    }

    if (ROLE_LEVEL[membership.role] < ROLE_LEVEL[role]) {
      return reply.status(403).send({ error: `Requires ${role} role in this company` })
    }

    request.membership = membership
  }
}
