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
  promoLink?: string
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
    labelid: parseInt($('a[href^="/l/"]').attr('href')?.split('/').pop() || '0'),
    id,
    onlyhavegift: false,
    title: $('h1').first().text().trim(),
    labelcover: $('body > div:nth-child(4) > div:nth-child(1) > div.col-md-12.col-lg-3.align-self-start.justify-content-end > a > img').attr('src') || '',
    boost: null,
    label: $('body > div:nth-child(4) > div:nth-child(1) > div.col-md-12.col-lg-3.align-self-start.justify-content-end > h1 > a').text().trim(),
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
      </body>
    </html>
  `)
})

app.get('/edit/:uid', async (c) => {
  const uid = c.req.param('uid')
  const isDizzylab = c.req.query('isDizzylab')
  const discUrl = c.req.query('discUrl')

  if (!uid || isDizzylab !== 'yes' || !discUrl) {
    return c.html('<h1>Invalid request</h1>', 400)
  }

  const discId = discUrl.split('/').pop()
  const resp = await fetch(`http://localhost:8787/api/disc/${discId}`)
  const disc = await resp.json()

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Edit Disc</title>
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
        form {
          max-width: 500px;
          margin: 0 auto;
        }
        label {
          display: block;
          margin-bottom: 10px;
        }
        input[type="text"],
        textarea {
          width: 100%;
          padding: 8px;
          margin-bottom: 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        button {
          padding: 8px 16px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background-color: #45a049;
        }
        .disc-image {
          max-width: 200px;
          max-height: 200px;
          margin-bottom: 10px;
        }
        </style>
      </head>
      <body>
        <h1>Edit Disc</h1>
        <h2>
          <a href="https://www.dizzylab.net/d/${disc.id}/" target="_blank">View Disc on Dizzylab</a>
          <a href="https://www.dizzylab.net/l/${disc.labelid}/" target="_blank">View Label on Dizzylab</a>
        </h2>
        <form>
          <label for="discTitle">Disc Title:</label>
          <input type="text" id="discTitle" value="${disc.title}" placeholder="Enter the disc title">

          <label for="discCover">Disc Cover URL:</label>
          <input type="text" id="discCover" value="${disc.cover}" placeholder="Enter the URL of the disc cover image">
          <img src="${disc.cover}" alt="${disc.title}" class="disc-image">

          <label for="discLabelId">Label ID:</label>
          <input type="text" id="discLabelId" value="${disc.labelid}" placeholder="Enter the label ID">

          <label for="discLabel">Label:</label>
          <input type="text" id="discLabel" value="${disc.label}" placeholder="Enter the label name">

          <label for="discLabelCover">Label Cover URL:</label>
          <input type="text" id="discLabelCover" value="${disc.labelcover}" placeholder="Enter the URL of the label cover image">
          <img src="${disc.labelcover}" alt="${disc.label}" class="label-image">

          <label for="discPromoLink">Promotion Link (optional):</label>
          <input type="text" id="discPromoLink" value="${disc.promoLink || ''}" placeholder="Enter the promotion link">


          <button type="submit">Save Changes</button>
        </form>

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

app.get('/wishlist/:uid', async (c) => {
  const uid = c.req.param('uid')

  if (!uid) {
    return c.html('<h1>User ID is required</h1>', 400)
  }

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Add to Wishlist</title>
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
        form {
          max-width: 500px;
          margin: 0 auto;
        }
        label {
          display: block;
          margin-bottom: 10px;
        }
        input[type="text"],
        textarea {
          width: 100%;
          padding: 8px;
          margin-bottom: 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        button {
          padding: 8px 16px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background-color: #45a049;
        }
        .disc-image {
          max-width: 200px;
          max-height: 200px;
          margin-bottom: 10px;
        }
        </style>
      </head>
      <body>
        <h1>Add to Wishlist</h1>
        <form action="/edit/${uid}" method="get">
          <label for="isDizzylab">Is it a Dizzylab disc?</label>
          <select id="isDizzylab" name="isDizzylab" required>
            <option value="">Select an option</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>

          <label for="discUrl">Dizzylab Disc URL:</label>
          <input type="text" id="discUrl" name="discUrl" placeholder="Enter the Dizzylab disc URL">

          <button type="submit">Next</button>
        </form>
      </body>
    </html>
  `)
})

export default app