import { makeRPCClient } from '@be4/client'
import { makeRPC, RPCError } from '@be4/server'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'

function setup() {
  const { router, procedure } = makeRPC<any>()

  const VoidProcedure = procedure
    .name('void')
    .output(z.string())
    .query(async function () {
      return 'void'
    })

  const HelloProcedure = procedure
    .name('hello')
    .input(z.string().min(5, 'Too short'))
    .output(z.string())
    .query(async function ({ input }) {
      return 'hello ' + input
    })

  const ThrowProcedure = procedure
    .name('throw')
    .input(z.string())
    .output(z.string())
    .mutation(async function () {
      throw new RPCError('UNAUTHORIZED', 'Unauthorized')
    })

  const UnimplementedProcedure = procedure
    .name('unimplemented')
    .input(z.string())
    .output(z.string())
    .query(async function () {
      throw new Error('Not implemented')
    })

  router.register(VoidProcedure)
  router.register(HelloProcedure)
  router.register(ThrowProcedure)

  const client = makeRPCClient({
    baseURL: 'http://localhost:4000/rpc',
    async fetch(request) {
      const response = await router.process({
        pathname: '/rpc',
        context: {},
        request: request as Request,
      })

      return response
    },
  })

  return {
    client,
    VoidProcedure,
    HelloProcedure,
    ThrowProcedure,
    UnimplementedProcedure,
  }
}

describe('client', () => {
  test('can call procedure', async () => {
    const { client, HelloProcedure, VoidProcedure } = setup()

    const response = await client.procedure(HelloProcedure).try('world')
    expect(response.isOk()).toBe(true)
    expect(response._unsafeUnwrap()).toBe('hello world')

    const voidRes = await client.procedure(VoidProcedure).try()
    expect(voidRes.isOk()).toBe(true)
    expect(voidRes._unsafeUnwrap()).toBe('void')
  })

  test('returns error on invalid input', async () => {
    const { client, HelloProcedure } = setup()

    const response = await client.procedure(HelloProcedure).try('worl')
    expect(response.isErr()).toBe(true)

    if (response.isErr()) {
      expect(response.error.code).toBe('VALIDATION_ERROR')
    }
  })

  test('returns error on procedure error', async () => {
    const { client, ThrowProcedure } = setup()

    const response = await client.procedure(ThrowProcedure).try('worl')
    expect(response.isErr()).toBe(true)

    if (response.isErr()) {
      expect(response.error.code).toBe('RPC_ERROR')
      expect(response.error.rpcErrCode).toBe('UNAUTHORIZED')
    }
  })

  test('returns error on invalid procedure', async () => {
    const { client, UnimplementedProcedure } = setup()

    const response = await client.procedure(UnimplementedProcedure).try('world')
    expect(response.isErr()).toBe(true)

    if (response.isErr()) {
      expect(response.error.code).toBe('RPC_ERROR')
      expect(response.error.rpcErrCode).toBe('NOT_FOUND')
    }
  })
})
