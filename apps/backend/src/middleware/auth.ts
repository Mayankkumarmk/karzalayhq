import { FastifyRequest, FastifyReply } from 'fastify'
import { $Enums } from '../generated/prisma/client'

/**
 * The authenticated user attached to the request by requireAuth.
 * Deliberately excludes `password` so a handler can never echo the hash back.
 */
export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  role: $Enums.UserRole
}

declare module 'fastify' {
  interface Session {
    userId: string
  }

  interface FastifyRequest {
    user?: AuthenticatedUser
  }
}

/**
 * Fastify preHandler. Reads the session cookie, loads the user, and attaches
 * `request.user`. Responds 401 and halts the request if there is no valid session.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.userId) {
    return reply.status(401).send({ error: 'Not authenticated' })
  }

  const user = await request.server.prisma.user.findUnique({
    where: { id: request.session.userId },
    select: { id: true, email: true, name: true, role: true },
  })

  if (!user) {
    // Session points at a deleted user — clear it so the client stops retrying.
    request.session.destroy()
    return reply.status(401).send({ error: 'Not authenticated' })
  }

  request.user = user
}
