import { Hono } from 'hono'
import { KVNamespace } from '@cloudflare/workers-types'
import { load } from 'cheerio'

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
  if (!uid) {
    return c.json({ error: 'User ID is required' }, 400)
  }
  if (!/^\d+$/.test(uid) || parseInt(uid) < 1) {
    return c.json({ error: 'Invalid user ID' }, 400)
  }
  const cacheKey = `discs_data_${uid}`
  const cache = await c.env.CD_COLLECTION.get(cacheKey)

  if (cache) {
    return c.json(JSON.parse(cache))
  }

  const resp = await fetch(`https://www.dizzylab.net/apis/getotheruserinfo/?r=100&uid=${uid}`)
  const data = await resp.json()

  await c.env.CD_COLLECTION.put(cacheKey, JSON.stringify(data.discs), {
    expirationTtl: 60 * 60 * 24 // cache for 1 day
  })

  return c.json(data.discs)
})


app.get('/api/disc/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Disc ID is required' }, 400)
  }

  const resp = await fetch(`https://www.dizzylab.net/d/${id}/`)
  const html = await resp.text()
  const $ = load(html)

  const disc: Disc = {
    cover: $('img#imgsrc0').attr('data-src') || '',
    labelid: 0,
    id,
    onlyhavegift: false,
    title: $('h1').first().text().trim(),
    labelcover: $('.label-link img').attr('src') || '',
    boost: null,
    label: $('.label-link').prev('span').text().trim(),
    comment: '',
  }

  return c.json(disc)
})

app.get('/view/:uid', async (c) => {
  const uid = c.req.param('uid')
  if (!uid) {
    return c.html('<h1>User ID is required</h1>', 400)
  }
  if (!/^\d+$/.test(uid) || parseInt(uid) < 1) {
    return c.html('<h1>Invalid user ID</h1> <p>User ID must be a positive integer</p>', 400)
  }
  const resp = await fetch(`http://localhost:8787/api/discs/${uid}`)
  const discs = await resp.json()

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>My CD Collection</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
          }
          h1 {
            text-align: center;
            margin-bottom: 20px;
          }
          #discs {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            grid-gap: 20px;
          }
          .disc {
            border: 1px solid #ccc;
            padding: 10px;
            text-align: center;
          }
          .disc img {
            width: 100%;
            height: auto;
            margin-bottom: 10px;
          }
          .disc h2 {
            font-size: 18px;
            margin-bottom: 5px;
          }
          .disc p {
            font-size: 14px;
            color: #666;
          }
          .disc-link {
            display: block;
            text-decoration: none;
            color: inherit;
          }
          .label-link {
            display: inline-block;
            vertical-align: middle;
            margin-left: 5px;
          }
          .label-link img {
            width: 30px;
            height: 30px;
            border-radius: 50%;
          }
        </style>
      </head>
      <body>
        <h1>My CD Collection</h1>
        <div id="discs">
          ${discs.map(disc => `
            <div class="disc">
              <a href="${disc.promoLink || `https://www.dizzylab.net/d/${disc.id}/`}" class="disc-link">
                <img src="${disc.cover}" alt="${disc.title}" />
                <h2>${disc.title}</h2>
              </a>
              <p>
                <span>${disc.label}</span>
                <a href="https://www.dizzylab.net/l/${disc.label}/" class="label-link">
                  <img src="${disc.labelcover}" alt="${disc.label}" />
                </a>
              </p>
            </div>
          `).join('')}
        </div>

        <h2>Add Dizzylab Disc</h2>
        <form id="addDiscForm">
          <label for="discUrl">Dizzylab Disc URL:</label>
          <input type="text" id="discUrl" name="discUrl" required>
          <button type="submit">Add Disc</button>
        </form>

        <div id="discDetails"></div>

        <script>
          const addDiscForm = document.getElementById('addDiscForm')
          const discDetailsDiv = document.getElementById('discDetails')

          addDiscForm.addEventListener('submit', async (event) => {
            event.preventDefault()
            const discUrl = document.getElementById('discUrl').value
            const discId = discUrl.split('/').pop()

            const response = await fetch(\`/api/disc/\${discId}\`)
            const disc = await response.json()

            discDetailsDiv.innerHTML = \`
              <h3>Disc Details</h3>
              <img src="\${disc.cover}" alt="\${disc.title}" />
              <input type="text" id="discTitle" value="\${disc.title}">
              <input type="text" id="discCover" value="\${disc.cover}">
              <input type="text" id="discPromoLink" value="\${disc.promoLink || ''}">
              <button id="saveChanges">Save Changes</button>
            \`

            const saveChangesButton = document.getElementById('saveChanges')
            saveChangesButton.addEventListener('click', () => {
              const updatedTitle = document.getElementById('discTitle').value
              const updatedCover = document.getElementById('discCover').value
              const updatedPromoLink = document.getElementById('discPromoLink').value

              disc.title = updatedTitle
              disc.cover = updatedCover
              disc.promoLink = updatedPromoLink

              const discElement = document.createElement('div')
              discElement.classList.add('disc')
              discElement.innerHTML = \`
                <a href="\${disc.promoLink || \`https://www.dizzylab.net/d/\${disc.id}/\`}" class="disc-link">
                  <img src="\${disc.cover}" alt="\${disc.title}" />
                  <h2>\${disc.title}</h2>
                </a>
                <p>
                  <span>\${disc.label}</span>
                  <a href="https://www.dizzylab.net/l/\${disc.label}/" class="label-link">
                    <img src="\${disc.labelcover}" alt="\${disc.label}" />
                  </a>
                </p>
              \`

              const discsDiv = document.getElementById('discs')
              discsDiv.appendChild(discElement)

              discDetailsDiv.innerHTML = ''
            })
          })
        </script>
      </body>
    </html>
  `)
})


export default app