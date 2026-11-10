// Small behaviours for the demo shop: tracking panels and the return form.
document.querySelectorAll('[data-track]').forEach(button => {
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.dataset.track)
    panel.hidden = !panel.hidden
  })
})
const policy = document.getElementById('policy')
const submit = document.getElementById('submit-return')
if (policy && submit) policy.addEventListener('change', () => { submit.disabled = !policy.checked })
// Each order has its own confirmation page, so the study can tell whether the
// right order was returned.
const form = document.getElementById('return-form')
if (form) form.addEventListener('submit', event => { event.preventDefault(); location.href = `return-done-${document.getElementById('order').value}.html` })
