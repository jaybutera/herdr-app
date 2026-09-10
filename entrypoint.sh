#!/bin/sh
# Joins the tailnet, then serves the app.
#
# Without TS_AUTHKEY this is a plain static host: the page is served, the API is
# not, and the app has to be pointed at an orchestrator it can reach by itself.
# With one, the container becomes a node on the tailnet and server.mjs can carry
# the app's API calls to the laptop — which is what lets the page and the API
# share a public origin, the only arrangement browsers still allow (see the
# comment on BRIDGE_TARGET in server.mjs).
#
# Deliberately not `set -e`. The page is the part that has to be up: an expired
# or single-use key, a tailnet that will not have us, a daemon that does not
# come up — none of that is a reason to serve nothing. Each one ends with the
# app served and the API answering "not configured here", which is a state the
# app draws properly, rather than a container that exits and takes the site
# down with it.

TS_UP=0

# Railway has no way to remove a variable, only to set one, so "off" has to be a
# value rather than an absence. A key is always `tskey-...`; anything else here
# means someone turned this off, and is not worth a failed join on every boot.
case "$TS_AUTHKEY" in
  tskey-*) ;;
  *) TS_AUTHKEY='' ;;
esac

if [ -n "$TS_AUTHKEY" ]; then
  # No interface of its own: a container gets no TUN device, so tailscaled runs
  # its network stack in userspace and hands out an HTTP proxy as the way in.
  /usr/local/bin/tailscaled \
    --state=mem: \
    --socket=/tmp/tailscaled.sock \
    --tun=userspace-networking \
    --outbound-http-proxy-listen=127.0.0.1:1055 \
    --socks5-server=127.0.0.1:1056 &

  # `tailscale up` needs the daemon's socket, which does not exist the instant
  # it is backgrounded.
  i=0
  while [ ! -S /tmp/tailscaled.sock ] && [ "$i" -lt 40 ]; do
    i=$((i + 1))
    sleep 0.25
  done

  if /usr/local/bin/tailscale --socket=/tmp/tailscaled.sock up \
    --authkey="$TS_AUTHKEY" \
    --hostname="${TS_HOSTNAME:-orcha-app-railway}" \
    --accept-dns=true \
    ${TS_EXTRA_ARGS}; then
    TS_UP=1
    export TS_HTTP_PROXY="${TS_HTTP_PROXY:-127.0.0.1:1055}"
    echo "tailscale: up as ${TS_HOSTNAME:-orcha-app-railway}"
    /usr/local/bin/tailscale --socket=/tmp/tailscaled.sock ip -4 2>/dev/null
  else
    echo "tailscale: could not join the tailnet; serving the app only" >&2
  fi
fi

# Proxying to an address only the tailnet can resolve, without the tailnet, is a
# request that can only time out. Better to say there is no bridge here.
if [ "$TS_UP" != "1" ] && [ -n "$BRIDGE_TARGET" ]; then
  echo "tailscale: not up, so BRIDGE_TARGET is ignored" >&2
  unset BRIDGE_TARGET
fi

exec node /app/server.mjs
