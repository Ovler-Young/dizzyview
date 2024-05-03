import { Hono } from 'hono'
import { KVNamespace } from '@cloudflare/workers-types'
export interface Env {
  CD_COLLECTION: KVNamespace;
}

interface Disc {
  cover: string
  comment: string
  labelid: number
  id: string
  onlyhavegift: boolean
  title: string
  labelcover: string
  boost: number | null
  label: string
}

const app = new Hono()

app.get('/api/discs/:uid', async (c) => {
  const uid = c.req.param('uid')
  const cacheKey = `discs_data_${uid}`
  const cache = await c.env.CD_COLLECTION.get(cacheKey)

  if (cache) {
    return c.json(JSON.parse(cache))
  }

  const resp = await fetch(`https://www.dizzylab.net/apis/getotheruserinfo/?r=20&uid=${uid}`)
  const data = await resp.json()

  await c.env.CD_COLLECTION.put(cacheKey, JSON.stringify(data.discs), {
    expirationTtl: 60 * 60 * 24 // cache for 1 day
  })

  return c.json(data.discs)
})

app.get('/view/:uid', async (c) => {
  const uid = c.req.param('uid')
  const resp = await fetch(`http://localhost:8787/api/discs/${uid}`)
  const discs = await resp.json()

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>My CD Collection</title>
      </head>
      <body>
        <h1>My CD Collection</h1>
        <div id="discs">
          ${discs.map(disc => `
            <div>
              <img src="${disc.cover}" alt="${disc.title}" style="width: 200px; height: auto;" />
              <h2>${disc.title}</h2>
              <p>${disc.label}</p>
            </div>
          `).join('')}
        </div>
      </body>
    </html>
  `)
})


export default app