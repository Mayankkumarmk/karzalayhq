import 'dotenv/config'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import { PrismaClient } from './generated/prisma/client'

const server = Fastify({ logger: true })
const prisma = new PrismaClient()

server.decorate('prisma', prisma)

server.register(cookie)
server.register(session, {
  secret: process.env.SESSION_SECRET || 'change-me-in-production-0123456789abc',
  cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
})

server.get('/health', async (request, reply) => {
  return { status: 'ok', version: '1' }
})

import authRoutes from './routes/auth'
server.register(authRoutes, { prefix: '/auth' })

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001
    await server.listen({ port, host: '0.0.0.0' })
    console.log(`Backend running on http://localhost:${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()

type PrismaClientInstance = InstanceType<typeof PrismaClient>
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClientInstance
  }
}
