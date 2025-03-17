import { createSignal, onMount, createEffect, For, Show } from 'solid-js'
import type { Component } from 'solid-js'
import type { OpenAPIV3_1 } from '@scalar/openapi-types'
import { Accordion } from '@kobalte/core/accordion'
import TabGroup from './tab-group'
import LineComponent from './line'

type EndpointType = {
  id: string
  path: string
  method: string
  operation: OpenAPIV3_1.OperationObject
}

type ApiReferenceProps = {
  schema?: OpenAPIV3_1.Document | null
  specification?: OpenAPIV3_1.Document | null
  endpointsByTag?: Record<string, EndpointType[]>
}

const ApiReference: Component<ApiReferenceProps> = (props) => {
  const [activeTag, setActiveTag] = createSignal<string | null>(null)
  const [activeEndpoint, setActiveEndpoint] = createSignal<string | null>(null)
  const [currentHash, setCurrentHash] = createSignal<string | null>(null)

  // Use server-provided data if available
  const specification = () => props.specification || null
  const endpointsByTag = () => props.endpointsByTag || {}

  onMount(() => {
    // Set the first tag as active if none is set
    if (Object.keys(endpointsByTag()).length > 0 && !activeTag()) {
      setActiveTag(Object.keys(endpointsByTag())[0])
    }
  })

  // Handle URL hash changes
  const handleScroll = () => {
    // Find all endpoint section headings
    const headings = document.querySelectorAll('div[id]')

    // Find the one that's currently in view
    let current = null
    for (const heading of headings) {
      // Only consider elements that are actual route elements (endpoints or tags)
      const id = heading.id
      if (!id) continue

      // Check if this is a valid tag or endpoint ID
      let isValidId = false

      // Check if it's a tag
      if (Object.keys(endpointsByTag()).includes(id)) {
        isValidId = true
      }

      // Check if it's an endpoint ID
      if (!isValidId) {
        for (const endpoints of Object.values(endpointsByTag())) {
          if (endpoints.some(e => e.id === id)) {
            isValidId = true
            break
          }
        }
      }

      if (!isValidId) continue

      const rect = heading.getBoundingClientRect()
      if (rect.top <= 100) {
        current = id
      } else {
        break
      }
    }

    if (current && current !== currentHash()) {
      setCurrentHash(current)
      // Update URL without causing a page reload
      history.replaceState(null, '', `#${current}`)

      // Update active tag/endpoint based on the current hash
      const tagMatch = Object.keys(endpointsByTag()).find(tag => tag === current)
      if (tagMatch) {
        setActiveTag(tagMatch)
      }

      // Check if the hash matches an endpoint ID
      for (const [tag, endpoints] of Object.entries(endpointsByTag())) {
        const endpoint = endpoints.find(e => e.id === current)
        if (endpoint) {
          setActiveTag(tag)
          setActiveEndpoint(endpoint.id)

          // Scroll the navigation to make sure the active item is visible
          setTimeout(() => {
            const activeNavItem = document.querySelector(`[href="#${endpoint.id}"]`)
            if (activeNavItem) {
              const navContainer = document.querySelector('.api-nav-container')
              if (navContainer) {
                const itemRect = activeNavItem.getBoundingClientRect()
                const containerRect = navContainer.getBoundingClientRect()

                if (itemRect.bottom > containerRect.bottom || itemRect.top < containerRect.top) {
                  activeNavItem.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              }
            }
          }, 100)

          break
        }
      }
    }
  }

  createEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })

    // Initial check for hash in URL
    if (window.location.hash) {
      const hash = window.location.hash.substring(1)
      setCurrentHash(hash)

      // Set active tag/endpoint based on initial hash
      for (const [tag, endpoints] of Object.entries(endpointsByTag())) {
        if (tag === hash) {
          setActiveTag(tag)
          break
        }

        const endpoint = endpoints.find(e => e.id === hash)
        if (endpoint) {
          setActiveTag(tag)
          setActiveEndpoint(endpoint.id)
          break
        }
      }
    }

    return () => window.removeEventListener('scroll', handleScroll)
  })

  return (
    <div class="relative my-20 flex gap-12">
      {/* Sidebar */}
      <div class="w-64 overflow-y-auto sticky top-10 max-h-[calc(100vh-4rem)] self-start api-nav-container">
        <nav>
          <For each={Object.entries(endpointsByTag())}>
            {([tag, endpoints]) => (
              <div class="mb-10">
                <h3 class="px-6 text-gray-7 leading-10">
                  #{tag.toLowerCase()}
                </h3>
                <ul>
                  <For each={endpoints}>
                    {(endpoint) => (
                      <li class="">
                        <LineComponent
                          href={`#${endpoint.id}`}
                          internalLink
                          state={activeEndpoint() === endpoint.id ? 'active' : undefined}
                        >
                          <div class="flex justify-between items-center w-full">
                            <span class="lowercase">{endpoint.operation.summary?.toLowerCase()}</span>
                            <span
                              classList={{
                                'text-blue-11': endpoint.method === 'get',
                                'text-green-11': endpoint.method === 'post',
                                'text-red-11': endpoint.method === 'delete',
                                'text-orange': endpoint.method === 'put',
                              }}
                            >
                              {endpoint.method.toUpperCase().replace("DELETE", "DEL")}
                            </span>
                          </div>
                        </LineComponent>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            )}
          </For>
        </nav >
      </div >

      {/* Main Content */}
      < div class="flex-1 flex flex-col gap-10 max-w-xl overflow-hidden" >
        <Show when={specification()}>
          <div class="flex flex-col gap-5">
            <div class="flex items-center gap-3 leading-10">
              <h1 class="font-bold">#{specification()?.info?.title?.toLowerCase() || 'api reference'}</h1>
              <span class="text-gray-7">
                v{specification()?.info?.version}
              </span>
            </div>
            <p class="text-gray-11">{specification()?.info?.description?.toLowerCase()}</p>
            <div class="">
              <div class="">
                <h3 class="font-bold lowercase leading-10">#servers</h3>
                <ul class="w-full bg-transparent text-white">
                  <For each={specification()?.servers || []}>
                    {(server) => (
                      <li class="text-gray-11 lowercase">{server.url} <span class="text-gray-7">({server.description})</span></li>
                    )}
                  </For>
                </ul>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto">
            <For each={Object.entries(endpointsByTag())}>
              {([tag, endpoints]) => (
                <div class="mb-10" id={tag}>
                  <h2 class="font-bold mb-4 lowercase">{tag}</h2>
                  <For each={endpoints}>
                    {(endpoint) => (
                      <div class="mb-8" id={endpoint.id}>
                        <div>
                          <div class="flex items-center">
                            <span
                              classList={{
                                'text-blue-11': endpoint.method === 'get',
                                'text-green-11': endpoint.method === 'post',
                                'text-red-11': endpoint.method === 'delete',
                                'text-orange': endpoint.method === 'put',
                              }}
                            >
                              {endpoint.method.toUpperCase()}
                            </span>
                            <h3 class="ml-3 font-mono">{endpoint.path}</h3>
                          </div>
                          <p class="mt-2 text-gray-11 lowercase">
                            {endpoint.operation.description?.toLowerCase()}
                          </p>
                        </div>

                        <div class="mt-4">
                          <h4 class="font-bold mb-2 lowercase text-gray-11">
                            endpoints
                          </h4>
                          <div class="mb-4">
                            <div class="flex items-center">
                              <span
                                classList={{
                                  'text-blue-11': endpoint.method === 'get',
                                  'text-green-11': endpoint.method === 'post',
                                  'text-red-11': endpoint.method === 'delete',
                                  'text-orange': endpoint.method === 'put',
                                }}
                              >
                                {endpoint.method.toUpperCase()}
                              </span>
                              <span class="ml-2 text-white">{endpoint.path}</span>
                            </div>
                          </div>

                          <Show when={endpoint.operation.responses}>
                            <div>
                              <h4 class="font-bold mb-2 lowercase text-gray-11">
                                responses
                              </h4>
                              <Accordion collapsible multiple class="w-full">
                                <For each={Object.entries(endpoint.operation.responses || {})}>
                                  {([statusCode, response]) => (
                                    <Accordion.Item value={`${endpoint.id}-${statusCode}`} class="mb-2">
                                      <Accordion.Header class="w-full">
                                        <Accordion.Trigger class="flex items-center w-full text-left py-2 px-2 transition-colors hover:bg-gray-1/10 rounded group">
                                          <span 
                                            classList={{
                                              'text-green-11': statusCode.startsWith('2'),
                                              'text-blue-11': statusCode.startsWith('3'),
                                              'text-orange': statusCode.startsWith('4'),
                                              'text-red-11': statusCode.startsWith('5'),
                                            }}
                                            class="font-mono"
                                          >{statusCode}</span>
                                          <span class="ml-2 text-gray-11 lowercase">
                                            {response.description?.toLowerCase()}
                                          </span>
                                          <div class="flex-1" />
                                          <div 
                                            class="text-gray-7 mr-1 transition-transform duration-200 group-data-[expanded]:rotate-180"
                                          >▼</div>
                                        </Accordion.Trigger>
                                      </Accordion.Header>
                                      <Accordion.Content class="pt-1 pb-3 pl-4 border-l border-gray-7/20">
                                        <Show when={response.content}>
                                          <For each={Object.entries(response.content || {})}>
                                            {([contentType, content]) => (
                                              <div class="mb-3">
                                                <div class="text-gray-11 text-sm mb-1 flex items-center">
                                                  <span class="py-1 px-2 bg-gray-1/10 rounded text-xs font-mono">{contentType}</span>
                                                </div>
                                                <Show when={content.schema}>
                                                  <TabGroup
                                                    tabs={[
                                                      {
                                                        label: "Schema",
                                                        value: "schema",
                                                        content: JSON.stringify(content.schema, null, 2)
                                                      },
                                                      ...(content.examples ? Object.entries(content.examples).map(([name, example]) => ({
                                                        label: name,
                                                        value: `example-${name}`,
                                                        content: JSON.stringify(example.value || example, null, 2)
                                                      })) : [])
                                                    ]}
                                                  />
                                                </Show>
                                              </div>
                                            )}
                                          </For>
                                        </Show>
                                      </Accordion.Content>
                                    </Accordion.Item>
                                  )}
                                </For>
                              </Accordion>
                            </div>
                          </Show>

                          <Show when={endpoint.operation['x-codeSamples']?.length}>
                            <div class="mt-6">
                              <h4 class="font-bold mb-2 lowercase text-gray-11">
                                examples
                              </h4>
                              <TabGroup
                                tabs={endpoint.operation['x-codeSamples'].map((sample: any) => ({
                                  label: sample.lang,
                                  value: sample.lang.toLowerCase(),
                                  content: sample.source
                                }))}
                              />
                            </div>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div >
    </div >
  )
}

export default ApiReference
