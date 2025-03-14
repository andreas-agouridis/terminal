import {
  type Component,
  type JSX,
  createSignal,
  Show,
  Switch,
  Match,
  createEffect,
} from 'solid-js'
import Caret from '@components/caret'
import { autofocus } from '@solid-primitives/autofocus'
import type { State } from 'src/types'
import Spinner from './spinner'

// ensures it doesn't get tree shaken
autofocus

type InputProps = {
  autofocus?: boolean
  state?: State
  message?: string
  result?: string
  readonly?: boolean
  onReturn?: (value: string) => void
} & JSX.InputHTMLAttributes<HTMLInputElement>

const InputComponent: Component<InputProps> = (props) => {
  let ref: HTMLInputElement | undefined

  const [visible, setVisible] = createSignal<boolean>(true)
  const [before, setBefore] = createSignal<string>()
  const [after, setAfter] = createSignal<string>()
  const [blink, setBlink] = createSignal<boolean>(true)
  const [, setInternalValue] = createSignal<string>()

  let blinkTimeout: ReturnType<typeof setTimeout> | undefined = undefined

  const update = () => {
    if (props.readonly) return

    setInternalValue(ref?.value)

    // const selection = document.getSelection()
    // const visible = selection?.isCollapsed ?? false
    const position = ref?.selectionStart ?? undefined

    if (blinkTimeout) clearTimeout(blinkTimeout)
    setBlink(false)

    if (position !== undefined) {
      const beforeText = ref?.value
        .substring(0, position)
        .replace(/ /g, '&nbsp')
      const afterText = ref?.value.substring(position).replace(/ /g, '&nbsp')

      setBefore(beforeText)
      setAfter(afterText)
    }

    setVisible(visible)

    blinkTimeout = setTimeout(() => {
      setBlink(true)
    }, 200)
  }

  const onInput: JSX.InputHTMLAttributes<HTMLInputElement>['onInput'] = (
    ev,
  ) => {
    if (props.onInput && typeof props.onInput === 'function') props.onInput(ev)
    update()
  }

  const onChange: JSX.InputHTMLAttributes<HTMLInputElement>['onChange'] = (
    ev,
  ) => {
    if (props.onChange && typeof props.onChange === 'function')
      props.onChange(ev)
    update()
  }

  const onBlur: JSX.InputHTMLAttributes<HTMLInputElement>['onBlur'] = (ev) => {
    if (props.onBlur && typeof props.onBlur === 'function') props.onBlur(ev)
    update()
  }

  createEffect(() => {
    if (props.state === 'normal') ref?.focus()
  }, [props.state])

  const submit = (ev: KeyboardEvent) => {
    if (props.state === 'busy') return

    const input = ev.target as HTMLInputElement
    if (ev.key === 'Enter') {
      if (props.onReturn && input.value) {
        ev.preventDefault()
        props.onReturn(input.value)
      }
    }
  }

  return (
    <div
      classList={{
        ...props.classList,
        'relative group/input': true,
        'flex items-start overflow-x-scroll no-scrollbar flex-wrap justify-start w-full':
          true,
        '!overflow-visible': props.state !== 'normal' || props.readonly,
        [props.class ?? '']: !!props.class,
      }}
    >
      <input
        {...props}
        use:autofocus={props.autofocus}
        ref={ref}
        value={props.value}
        classList={{
          'focus:text-white leading-10 placeholder:text-gray-10': true,
          'focus:outline-none whitespace-nowrap caret-transparent bg-transparent':
            true,
          'animate-shake': props.state === 'error',
          // hidden: props.state !== 'normal',
        }}
        onInput={onInput}
        onKeyUp={update}
        onSelect={update}
        onMouseMove={update}
        onMouseUp={update}
        onTouchStart={update}
        onPaste={update}
        onCut={update}
        onKeyPress={submit}
        onChange={onChange}
        onBlur={onBlur}
      // onKeyDown={update}
      />
      <Show when={props.state !== 'normal'}>
        <span class="text-white leading-10 flex gap-2 flex-wrap self-center">
          <div
            classList={{
              'w-4 h-4 self-center shrink': true,
              'text-blue-11': props.state === 'busy',
              'text-green-11': props.state === 'success',
              hidden: props.state === 'error',
            }}
          >
            <Switch>
              <Match when={props.state === 'busy'}>
                <Spinner />
              </Match>
              <Match when={props.state === 'success'}>
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g id="check-small, checkmark-small">
                    <path
                      id="vector"
                      class="stroke-current"
                      d="M5 11.9651L8.37838 14.7522L15 5.83331"
                      stroke-width="1.5"
                      stroke-linecap="square"
                    />
                  </g>
                </svg>
              </Match>
              <Match when={props.state === 'error'}>
                <svg
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    class="fill-current"
                    d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                  ></path>
                </svg>
              </Match>
            </Switch>
          </div>
          <span class="text-gray-10 grow">{props.message}</span>
        </span>
      </Show>
      <div
        class="absolute inset-0 flex h-10 items-center pointer-events-none"
        aria-hidden="true"
      >
        <div class="flex items-center leading-10 whitespace-nowrap focus:outline-none">
          <span
            class="text-transparent"
            innerHTML={
              before() ?? (props.readonly ? props.value?.toString() : '')
            }
          ></span>
          <Caret
            blink={blink()}
            classList={{
              'hidden group-has-[:focus]/input:block': true,
              '!block ml-1.5': props.readonly,
              // '!hidden': !visible() || props.state !== 'normal',
            }}
          />
          <span class="text-transparent" innerHTML={after()}></span>
        </div>
      </div>
    </div>
  )
}

export default InputComponent
