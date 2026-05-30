import { useUserStore } from '../stores/user'

export const vPerm = {
  mounted(el, binding) {
    const store = useUserStore()
    if (!store.hasPerm(binding.value)) {
      el.parentNode?.removeChild(el)
    }
  },
}
