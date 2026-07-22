import { installNetworkGuard } from '@/infrastructure/config/network-guard'

// Every unit/integration test run must be fully offline: no real Foundry API,
// no real LLM provider. This throws on any attempt to reach a non-loopback host.
installNetworkGuard()
