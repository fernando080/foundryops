import net from 'node:net'

/**
 * Patches `net.Socket#connect` so any attempt to open a TCP/IPC connection to
 * a non-loopback host throws instead of silently reaching the real network.
 *
 * Installed by `tests/setup.ts` so unit/integration runs can never escape the
 * mock Foundry client / stub LLM provider, regardless of what a dependency
 * (or a bug) tries to dial out to. Loopback (localhost / 127.0.0.0/8 / ::1)
 * and Unix-domain / named-pipe connections remain allowed so a local dev
 * server (e.g. Playwright driving `next dev`) still works.
 */

interface ConnectOptionsLike {
  host?: string
  path?: string
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'])

// A single 0-255 octet, used to validate the three trailing octets of a
// 127.0.0.0/8 address (the leading "127." is matched literally below).
const OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const LOOPBACK_IPV4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`)

function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined) return true
  if (LOOPBACK_HOSTS.has(host)) return true
  return LOOPBACK_IPV4.test(host)
}

function resolveTargetHost(args: unknown[]): string | undefined {
  const [first, second] = args

  if (typeof first === 'number') {
    // connect(port[, host][, connectListener]) — net defaults the host to localhost.
    return typeof second === 'string' ? second : 'localhost'
  }

  if (typeof first === 'string') {
    // connect(path[, connectListener]) — Unix domain socket / named pipe, always local.
    return undefined
  }

  if (first !== null && typeof first === 'object') {
    const opts = first as ConnectOptionsLike
    if (opts.path) return undefined
    return opts.host ?? 'localhost'
  }

  return undefined
}

let guardInstalled = false

export function installNetworkGuard(): void {
  if (guardInstalled) return
  guardInstalled = true

  const original = net.Socket.prototype.connect

  const guardedConnect = function guardedConnect(this: net.Socket, ...args: unknown[]): net.Socket {
    const host = resolveTargetHost(args)
    if (!isLoopbackHost(host)) {
      throw new Error(
        `network-guard: blocked outbound connection to non-loopback host "${String(host)}". ` +
          'FoundryOps must never reach the real network in this mode — use the mock/stub adapters.',
      )
    }
    return (original as (...a: unknown[]) => net.Socket).apply(this, args)
  }

  net.Socket.prototype.connect = guardedConnect as unknown as typeof net.Socket.prototype.connect
}
