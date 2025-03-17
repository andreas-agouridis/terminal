import { type Component, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import type { State } from 'src/types'

type LineProps = {
  href?: string
  state?: State
  inactive?: boolean
  internalLink?: boolean
} & JSX.HTMLAttributes<HTMLDivElement>

const LineComponent: Component<LineProps> = (props) => {
  return (
    <Dynamic
      component={props.href ? 'a' : 'div'}
      tabindex="0"
      href={props.href}
      target={props.href && !props.internalLink ? '_blank' : undefined}
      {...props}
      classList={{
        line: true,
        ...props.classList,
        'group flex leading-10 items-center text-gray-10 hover:bg-gray-5 px-4 sm:px-[22px] border-transparent border-l-2':
          true,
        '!border-orange text-gray-11 bg-gray-6':
          !props.inactive && props.state === 'active',
        'active:border-orange active:text-gray-11 active:bg-gray-6':
          !props.inactive,
        '[&>svg]:hover:block [&>svg]:active:text-gray-11':
          !!props.href && !props.internalLink,
        '!border-green-11 !bg-green-5': props.state === 'success',
        '!border-red-11 !bg-red-5': props.state === 'error',
        '!border-blue-11 !bg-blue-5': props.state === 'busy',
        '!border-yellow-11 !bg-yellow-5': props.state === 'warning',
        'focus:border-orange focus:text-gray-11 focus:bg-gray-6 focus:outline-none':
          !props.inactive,
        'has-[:focus]:border-orange has-[:focus]:text-gray-11 has-[:focus]:bg-gray-6 has-[:focus]:outline-none':
          !props.inactive,
        // 'pointer-events-none': props.state && props.state !== 'normal',
        [props.class ?? '']: !!props.class,
      }}
    >
      {props.children}
      <svg
        class="hidden w-5 h-5 ml-6 text-gray-10 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g id="square-arrow-top-right, open, new, link, open link, box, arrow">
          <path
            class="stroke-current"
            d="M15.2083 11.6667V16.875H3.125V4.79167H7.70833M11.4583 3.125H16.875V8.54167M9.16667 10.8333L16.25 3.75"
            stroke-width="1.5"
            stroke-linecap="square"
          ></path>
        </g>
      </svg>
    </Dynamic>
  )
}

export default LineComponent
