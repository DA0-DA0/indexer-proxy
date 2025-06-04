type Env = {
  API_KEY: string
}

const INDEXER_HOST_MAP = {
  'juno-1': 'juno-mainnet.indexer.zone',
  'uni-7': 'juno-testnet.indexer.zone',
  'osmosis-1': 'osmosis-mainnet.indexer.zone',
  'osmo-test-5': 'osmosis-testnet.indexer.zone',
  'stargaze-1': 'stargaze-mainnet.indexer.zone',
  'elgafar-1': 'stargaze-testnet.indexer.zone',
  'neutron-1': 'neutron-mainnet.indexer.zone',
  'pion-1': 'neutron-testnet.indexer.zone',
  'migaloo-1': 'migaloo-mainnet.indexer.zone',
  'narwhal-2': 'migaloo-testnet.indexer.zone',
  Oraichain: 'oraichain-mainnet.indexer.zone',
  'phoenix-1': 'terra-mainnet.indexer.zone',
  'kaiyo-1': 'kujira-mainnet.indexer.zone',
  'harpoon-4': 'kujira-testnet.indexer.zone',
  'columbus-5': 'terraClassic-mainnet.indexer.zone',
  'bitsong-2b': 'bitsong-mainnet.indexer.zone',
  bobnet: 'bitsong-testnet.indexer.zone',
  'omniflixhub-1': 'omniflix-mainnet.indexer.zone',
  'flixnet-4': 'omniflix-testnet.indexer.zone',
  provider: 'cosmosHubProvider-testnet.indexer.zone',
  'theta-testnet-001': 'cosmosHubTheta-testnet.indexer.zone',
  'cosmoshub-4': 'cosmosHub-mainnet.indexer.zone',
  'bbn-test-5': 'babylon-testnet.indexer.zone',
  'dev-1': 'thorChain-testnet.indexer.zone',
  'xion-testnet-2': 'xion-testnet.indexer.zone',
  'xion-mainnet-1': 'xion-mainnet.indexer.zone',
  'thorchain-stagenet-2': 'thorchain-stagenet.indexer.zone',
}

const queryIndexer = async ({ API_KEY }: Env, url: URL) => {
  // Get first path segment to match chain ID and get host.
  const chainId = url.pathname.split('/')[1]
  const host =
    chainId in INDEXER_HOST_MAP
      ? INDEXER_HOST_MAP[chainId as keyof typeof INDEXER_HOST_MAP]
      : null
  if (host === null) {
    throw new Response('Invalid chain ID', { status: 400 })
  }

  url.protocol = 'https'
  url.host = host
  // Forward the rest of the path to the indexer.
  url.pathname = '/' + url.pathname.split('/').slice(2).join('/')

  // Get response and add CORS header to response.
  const response = await fetch(url.toString(), {
    headers: {
      'X-Api-Key': API_KEY,
    },
  })

  return {
    status: response.status,
    body: await response.text(),
    headers: response.headers,
  }
}

//! Entrypoint.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const method = request.method.toUpperCase()
    const url = new URL(request.url)

    // Respond to OPTIONS requests.
    if (method === 'OPTIONS') {
      const origin = request.headers.get('Origin') || ''
      const corsRequestHeaders = request.headers.get(
        'Access-Control-Request-Headers'
      )

      if (
        origin &&
        request.headers.get('Access-Control-Request-Method') !== null &&
        corsRequestHeaders
      ) {
        // Handle CORS preflight requests.
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
            'Access-Control-Max-Age': '86400',
            'Access-Control-Allow-Headers': corsRequestHeaders,
          },
        })
      } else {
        // Handle standard OPTIONS request.
        return new Response(null, {
          headers: {
            Allow: 'GET, HEAD, POST, OPTIONS',
          },
        })
      }
    } else if (method === 'GET') {
      // Proxy one request.
      try {
        const response = await queryIndexer(env, new URL(request.url))
        const contentType = response.headers.get('Content-Type')
        return new Response(response.body, {
          status: response.status,
          headers: {
            ...(contentType && {
              'Content-Type': contentType,
            }),
            'Access-Control-Allow-Origin': '*',
          },
        })
      } catch (err) {
        console.error(err)

        if (err instanceof Response) {
          return err
        }

        throw new Response(
          `Unexpected server error: ${
            err instanceof Error ? err.message : err
          }`,
          { status: 500 }
        )
      }
    } else if (
      method === 'POST' &&
      url.pathname.split('/')[1] === 'batch' &&
      url.pathname.split('/').length <= 3
    ) {
      // Batch requests.
      const paths = await request.json()
      if (!Array.isArray(paths)) {
        return new Response('Invalid request', { status: 400 })
      }

      try {
        const responses = await Promise.all(
          paths.map(async (path) => {
            const url = new URL(request.url)
            url.pathname = path.split('?')[0]
            url.search = path.split('?')[1]
            try {
              return await queryIndexer(env, url)
            } catch (err) {
              return {
                status: 400,
                body:
                  err instanceof Error
                    ? err.message
                    : 'unknown error querying indexer',
              }
            }
          })
        )

        return new Response(JSON.stringify(responses), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
      } catch (err) {
        console.error(err)

        if (err instanceof Response) {
          return err
        }

        throw new Response(
          `Unexpected server error: ${
            err instanceof Error ? err.message : err
          }`,
          { status: 500 }
        )
      }
    }

    return new Response('Not found', { status: 404 })
  },
}
