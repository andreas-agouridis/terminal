import { defineConfig } from 'astro/config'
import tailwind from '@astrojs/tailwind'
import solid from '@astrojs/solid-js'
import aws from 'astro-sst'
import mdx from '@astrojs/mdx'
import remarkDirective from 'remark-directive'
import { remarkAsides } from './lib/unified/asides'
import { remarkVhs } from './lib/unified/vhs'
import { remarkCode } from './lib/unified/code'
import textjs from '@textjs/core/vite'
import react from '@astrojs/react'

export default defineConfig({
  integrations: [
    mdx({
      // syntaxHighlight: 'prism',
      remarkPlugins: [remarkDirective, remarkAsides, remarkVhs],
      rehypePlugins: [remarkCode],
    }),
    tailwind({ applyBaseStyles: false }),
    solid({ exclude: '**/cui/**/*' }),
    react({ include: '**/cui/**/*' }),
  ],
  server: { host: true },
  adapter: aws(),
  output: 'server',
  redirects: {
    '/report': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '/feud': 'https://jean-types-icq-calls.trycloudflare.com',
  },
  vite: {
    plugins: [textjs('./src/cui')],
  },
})
