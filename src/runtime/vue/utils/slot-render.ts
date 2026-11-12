import type { FunctionalComponent, VNode } from 'vue'

/** Renders a slot function handed down through `provide` as a component: `<SlotRender :render :props />`. */
export const SlotRender: FunctionalComponent<{ render: (props: never) => VNode[], props: object }> = p => p.render(p.props as never)
