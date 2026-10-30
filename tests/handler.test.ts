import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent, Context } from 'aws-lambda'

const { send, client, command } = vi.hoisted(() => ({
  send: vi.fn(),
  client: vi.fn(),
  command: vi.fn()
}))

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: class {
    constructor(config: unknown) { client(config) }
    send = send
  },
  AllocateAddressCommand: class {
    constructor(input: unknown) { command(input) }
  }
}))

import { handler } from '../src/handler'

const invoke = (event: unknown = {}) => handler(
  event as APIGatewayProxyEvent,
  {} as Context,
  vi.fn()
)

describe('allocateElasticIp handler', () => {
  beforeEach(() => {
    send.mockReset()
    command.mockClear()
    vi.restoreAllMocks()
  })

  it('allocates a VPC address and returns its identifiers', async () => {
    send.mockResolvedValue({ AllocationId: 'eipalloc-123', PublicIp: '192.0.2.1', extra: 'ignored' })
    const result = await invoke()
    expect(command).toHaveBeenCalledExactlyOnceWith({ Domain: 'vpc' })
    expect(send).toHaveBeenCalledOnce()
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ success: true, allocationId: 'eipalloc-123', publicIp: '192.0.2.1' })
    })
  })

  it.each([
    [{}, { success: true }],
    [{ AllocationId: 'eipalloc-123' }, { success: true, allocationId: 'eipalloc-123' }],
    [{ PublicIp: '192.0.2.1' }, { success: true, publicIp: '192.0.2.1' }],
    [{ AllocationId: null, PublicIp: null }, { success: true, allocationId: null, publicIp: null }]
  ])('handles incomplete SDK responses %#', async (sdkResponse, body) => {
    send.mockResolvedValue(sdkResponse)
    const result = await invoke()
    expect(result?.statusCode).toBe(200)
    expect(JSON.parse(result!.body)).toEqual(body)
  })

  it.each([null, undefined, 'invalid', { body: '{invalid json' }])(
    'does not inspect the incoming event (%#)', async event => {
      send.mockResolvedValue({ AllocationId: 'eipalloc-123', PublicIp: '192.0.2.1' })
      expect((await invoke(event))?.statusCode).toBe(200)
      expect(send).toHaveBeenCalledOnce()
    }
  )

  it.each([new Error('allocation failed'), 'failure', null])(
    'returns a generic error when the SDK rejects (%#)', async error => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      send.mockRejectedValue(error)
      const result = await invoke()
      expect(result).toEqual({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error in allocateElasticIpLambda' }) })
      expect(log).toHaveBeenCalledOnce()
    }
  )

  it('does not disclose sensitive SDK error details in the response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    send.mockRejectedValue(new Error('secret-token-123'))
    expect((await invoke())?.body).not.toContain('secret-token-123')
  })

  // The handler currently logs the raw SDK error. Keep this regression visible until fixed.
  it.fails('does not write sensitive SDK error details to logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    send.mockRejectedValue(new Error('secret-token-123'))
    await invoke()
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token-123')
    expect(log.mock.calls.flat().map(String).join(' ')).not.toContain('secret-token-123')
  })
})
