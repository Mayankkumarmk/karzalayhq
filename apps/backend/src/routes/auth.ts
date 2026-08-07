import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import bcrypt from 'bcrypt'
import { $Enums } from '../generated/prisma/client'
import { isValidEmail, isValidPassword, isValidRole } from '../lib/validation'
import { requireAuth } from '../middleware/auth'

const SALT_ROUNDS = 10

async function register(request: FastifyRequest, reply: FastifyReply) {
  const { name, email, password, role } = request.body as {
    name?: string
    email?: string
    password?: string
    role?: string
  }

  if (!name || !email || !password) {
    return reply.status(400).send({ error: 'name, email, and password are required' })
  }

  if (!isValidEmail(email)) {
    return reply.status(400).send({ error: 'Invalid email format' })
  }

  if (!isValidPassword(password)) {
    return reply.status(400).send({ error: 'Password must be at least 8 characters' })
  }

  if (role && !isValidRole(role)) {
    return reply.status(400).send({ error: 'Role must be MEMBER or LEAD' })
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

  try {
    const user = await request.server.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: (role as $Enums.UserRole) || $Enums.UserRole.MEMBER,
      },
    })

    request.session.userId = user.id

    return reply.status(201).send({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
  } catch (err: any) {
    if (err.code === 'P2002' && err.meta?.target?.includes('email')) {
      return reply.status(409).send({ error: 'Email already registered' })
    }
    throw err
  }
}

async function login(request: FastifyRequest, reply: FastifyReply) {
  const { email, password } = request.body as { email?: string; password?: string }

  if (!email || !password) {
    return reply.status(400).send({ error: 'email and password are required' })
  }

  const user = await request.server.prisma.user.findUnique({ where: { email } })

  if (!user) {
    return reply.status(401).send({ error: 'Invalid credentials' })
  }

  const match = await bcrypt.compare(password, user.password)

  if (!match) {
    return reply.status(401).send({ error: 'Invalid credentials' })
  }

  request.session.userId = user.id

  return reply.status(200).send({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  })
}

async function logout(request: FastifyRequest, reply: FastifyReply) {
  request.session.destroy()
  return reply.status(200).send({ success: true })
}

async function me(request: FastifyRequest, reply: FastifyReply) {
  // requireAuth has already loaded and validated the user.
  const { id, name, email, role } = request.user!
  return reply.status(200).send({ id, name, email, role })
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', register)
  fastify.post('/login', login)
  fastify.post('/logout', logout)
  fastify.get('/me', { preHandler: requireAuth }, me)
}
