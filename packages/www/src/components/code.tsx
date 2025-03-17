import { type Component } from 'solid-js'
import { highlighter } from "@terminal/www/lib/shiki";

export type CodeProps = {
  language: string
  code: string
}

const Code: Component<CodeProps> = (props) => {
  const html = highlighter.codeToHtml(props.code, {
    lang: props.language,
    theme: "terminal",
  })

  return (
    <div innerHTML={html} class="overflow-x-auto bg-gray-1 p-4" />
  )
}

export default Code
