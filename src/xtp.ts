import createPlugin, { Plugin, PluginOutput } from '@extism/extism'
import cacache from 'cacache'

const KEEP_RESIDENT_TIME = 1000
const REFETCH_TIME = 1000

declare module "cacache" {
  namespace index {
    function insert(path: string, key: string, integrity: string, opts: cacache.put.Options): any;
  }
}

export interface StoredPlugin {
  metadata: Record<string, string>,
  integrity: string,
  data: Uint8Array,
  size: number
}

export interface ExtensionStorage {
  getByExtIdGuestKey: (extId: string, guestKey: string) => Promise<StoredPlugin | null>,
  getByETag: (etag: string) => Promise<StoredPlugin | null>,
  store: (extId: string, guestKey: string, etag: string, meta: Record<string, string>, content: Uint8Array) => Promise<void>,
}

export interface XTPClientOptions {
  baseUrl?: string,
  token: string,
  appId: string,
  fetch?: typeof fetch,
  functions?: Record<string, Record<string, CallableFunction>>,
  storage?: ExtensionStorage
}

export interface RegisterGuest {
  email: string,
  name: string,
  guestKey: string
}

interface Extension {
  name: string,
  id: string,
  schema: any
}

interface ExtendedRequestInit extends Omit<RequestInit, 'body'> {
  body?: RequestInit['body'] | Record<string, any>
}

const kLoadExtPoints = Symbol('load-ext-points')

export default async function createClient({
  baseUrl,
  token,
  appId,
  fetch,
  storage,
  functions
}: XTPClientOptions): Promise<Client> {
  baseUrl = String(baseUrl ?? 'https://xtp.dylibso.com')
  baseUrl = new URL(baseUrl).origin
  if (!token || typeof token !== 'string') {
    throw new TypeError(`property "token" is required to instantiate an XTP client`)
  }
  if (!appId || typeof appId !== 'string') {
    throw new TypeError(`property "appId" is required to instantiate an XTP client`)
  }
  fetch = globalThis.fetch
  functions ??= {}
  storage ??= new FilesystemStorage()
  const client = new Client({ baseUrl, fetch, token, appId, functions, storage })
  await client[kLoadExtPoints]()
  return client
}

class Client {
  #baseUrl: string
  #token: string
  #fetch: typeof fetch
  #appId: string
  #extPoints: Record<string, string> = {}
  #functions: Record<string, Record<string, CallableFunction>>
  #online: Record<string, { lastCall: number, plugin: Promise<Plugin> }>
  #storage: ExtensionStorage

  extensionPoints: { [k: string]: { [k: string]: <A, T>(guestKey: string, param: A, context: any, defaultValue: T) => Promise<T> } } = {}

  constructor(opts: Required<XTPClientOptions>) {
    this.#baseUrl = opts.baseUrl
    this.#token = opts.token
    this.#fetch = opts.fetch
    this.#appId = opts.appId
    this.#functions = opts.functions
    this.#storage = opts.storage
    this.#online = {}

    setInterval(async () => {
      const now = Date.now()
      for (const [key, { lastCall, plugin }] of Object.entries(this.#online)) {
        if ((now - lastCall) > KEEP_RESIDENT_TIME) {
          console.log('killing ', key)
          delete this.#online[key]
          const p = await plugin
          p.close().catch((err: Error) => {
            // TODO: log error
          })
        }
      }
    }, 1000)
  }

  async #request(path: string, opts: ExtendedRequestInit = {}) {
    // TODO: retry logic + respecting 429
    opts.headers ??= {};
    // hush, typescript
    const headers = opts.headers as Record<string, string>
    if (opts.body && !opts.method) {
      opts.method = 'POST'
    }

    if (typeof opts.body === 'object') {
      opts.body = JSON.stringify(opts.body)
      headers['content-type'] ??= 'application/json; charset=utf-8'
    }

    headers['authorization'] ??= `Bearer ${this.#token}`
    console.log(headers)
    const response = await this.#fetch(`${this.#baseUrl}${path}`, opts as RequestInit)

    console.log(`${opts.method || 'GET'} ${path} - ${response.status} ${response.statusText}`)
    if (response.status >= 400) {
      throw Object.assign(new Error(`${opts.method} ${path} - ${response.status} ${response.statusText}`), {
        response
      })
    }

    return response
  }

  async #getPlugin(extId: string, guestKey: string) {
    const key = `${extId}:${guestKey}`
    const entry = this.#online[key]
    if (entry) {
      entry.lastCall = Date.now()
      return entry.plugin
    }

    const info = await this.#getPluginSource(extId, guestKey)

    if (!info) {
      return null
    }

    const plugin = createPlugin(info.data.buffer, {
      useWasi: true,
      functions: this.#functions as any
    })

    // we'll handle the error in a second
    plugin.catch(() => { });
    this.#online[key] = {
      lastCall: Date.now(),
      plugin
    }

    return await plugin
  }

  async #getPluginSource(extId: string, guestKey: string) {
    const localPlugin = await this.#storage.getByExtIdGuestKey(extId, guestKey)

    const {
      metadata = {},
      data = null
    } = localPlugin ?? {}

    const result = data ? { data, type: metadata['content-type'] } : null
    if (!data || (Date.now() - Number(metadata?.last || 0)) > REFETCH_TIME) {
      const response = await this.#request(`/api/v1/extension-points/${extId}/installs/guest/${guestKey}`, {
        redirect: 'manual',
        headers: metadata?.etag ? {
          'etag': metadata.etag
        } : {}
      })

      if (response.status === 404) {
        return result // return what we have
      }

      if (response.status === 304) {
        // TODO: this.#storage.updateIndex(lastFetched: now)
        return result
      }

      const location = response.headers.get('location')
      if (response.status !== 303 || !location) {
        // TODO: log an error!
        return result
      }

      const redirectUrl = new URL(location, this.#baseUrl)
      if (redirectUrl.origin !== this.#baseUrl) {
        throw new Error(`server redirect with mismatching "origin": expected "${this.#baseUrl}", got "${redirectUrl.origin}"`)
      }

      {
        const response = await this.#request(redirectUrl.pathname, {})

        if (!response.ok) {
          // we failed to fetch the data. it's fine! it's fine!
          return result
        }

        const newData = new Uint8Array(await response.arrayBuffer())
        const etag = response.headers.get('etag') || ''
        const type = response.headers.get('content-type') || 'application/octet-stream'
        // const data = Buffer.from(await response.arrayBuffer())
        this.#storage.store(
          extId,
          guestKey,
          etag,
          { etag, last: String(Date.now()), 'content-type': type },
          newData
        )

        return { data: newData, type }
      }
    }

    return result
  }

  async[kLoadExtPoints]() {
    const response = await this.#request(`/api/v1/apps/${this.#appId}/extension-points`)
    const extensionPoints = await response.json() as any
    const objects: Extension[] = Array.isArray(extensionPoints) ? extensionPoints : extensionPoints.objects

    for (const extension of objects) {
      const exports = extension.schema?.exports ?? []
      for (const exp of exports) {
        this.extensionPoints[extension.name] = {
          [exp.name]: async <A>(guestKey: string, param: A, defaultValue: any) => {
            const [err, plugin]: [Error | null, Plugin | null] = await this.#getPlugin(extension.id, guestKey).then(
              (result: Plugin | null) => [null, result],
              err => [err, null]
            )
            if (err) {
              // TODO: log error!
            }

            console.log('!'.repeat(10), extension.name, exp.name, plugin, err)
            if (!plugin || err) {
              return defaultValue
            }

            const arg = (
              ArrayBuffer.isView(param) ? new Uint8Array(param.buffer) :
                typeof param === 'string' ? param :
                  JSON.stringify(param)
            )
            const [err2, data]: [Error | null, PluginOutput | null] = await plugin.call(exp.name, arg).then(
              result => [null, result],
              err => [err, null]
            )

            if (err2) {
              throw err2
            }
            return data
          }
        }
      }
    }

    this.#extPoints = objects.reduce((acc: Record<string, string>, xs: { name: string, id: string }) => {
      acc[xs.name] = xs.id
      return acc
    }, Object.create(null))
  }

  async inviteGuest(opts: RegisterGuest) {
    const response = await this.#request(`/api/v1/apps/${this.#appId}/guests/invite`, {
      body: {
        email: opts.email,
        name: opts.name,
        guestKey: opts.guestKey
      }
    })

    if (!response.ok) {
      throw Object.assign(new Error('bad request'), {
        response
      })
    }

    return await response.json()
  }

  async invoke(name: string) {
    return this.#extPoints[name]
  }
}

class FilesystemStorage implements ExtensionStorage {
  #cacheDir: string
  constructor(dir = process.env.XTP_PLUGIN_CACHE_DIR ?? `.xtp`) {
    this.#cacheDir = dir
    console.log(this.#cacheDir)
  }

  async getByExtIdGuestKey(extId: string, guestKey: string) {
    const result = await cacache.get(this.#cacheDir, `xtpv1:ext:${extId}:${guestKey}`).catch(err => {
      if (err.code === 'ENOENT') {
        return null
      }
      throw err
    })

    if (!result) {
      return null
    }

    return {
      size: result.size,
      integrity: result.integrity,
      data: new Uint8Array(result.data),
      metadata: result.metadata
    }
  }

  async getByETag(tag: string) {
    const result = await cacache.get(this.#cacheDir, `xtpv1:etag:${tag}`).catch(err => {
      if (err.code === 'ENOENT') {
        return null
      }
      throw err
    })

    if (!result) {
      return null
    }

    return {
      size: result.size,
      integrity: result.integrity,
      data: new Uint8Array(result.data),
      metadata: result.metadata
    }
  }

  async store(extId: string, guestKey: string, etag: string, metadata: Record<string, string>, data: Uint8Array) {
    const integrity = await cacache.put(this.#cacheDir, `xtpv1:etag:${etag}`, data, {
      metadata,
      size: data.byteLength
    })

    cacache.index.insert(this.#cacheDir, `xtpv1:ext:${extId}:${guestKey}`, integrity, {
      metadata,
      size: data.byteLength
    })
  }
}
