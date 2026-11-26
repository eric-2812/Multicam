// Head lines of the page kit (kept in a file because the page's Content Security Policy allows no
// inline scripts): the hero's entrance and the moments' guard, set before the first paint.
document.documentElement.classList.add('m-enter')
setTimeout(() => document.documentElement.classList.add('m-enter-done'), 700)
document.documentElement.classList.add('mo-js')
setTimeout(() => document.documentElement.classList.add('mo-safe'), 2500)
