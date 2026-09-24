import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";

/**
 * Addresses outbound requests to user-influenced hosts must never reach:
 * loopback, private, link-local (cloud metadata), CGNAT, multicast and reserved ranges.
 */
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) {
    // IPv4-mapped IPv6: judge the embedded IPv4 address.
    const embedded = address.slice(7);
    return isIP(embedded) === 4 ? !blocked.check(embedded, "ipv4") : false;
  }
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

export class BlockedAddressError extends Error {
  constructor(readonly hostname: string) {
    super(`refusing to connect to non-public address for ${hostname}`);
    this.name = "BlockedAddressError";
  }
}

/**
 * DNS lookup that fails when any resolved address is not public. Used as the
 * socket `lookup`, so the validated address is the one actually connected to
 * (no DNS-rebinding window between check and connect).
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  if (isIP(hostname)) {
    callback(new BlockedAddressError(hostname), []);
    return;
  }
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }
    if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
      callback(new BlockedAddressError(hostname), []);
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};
