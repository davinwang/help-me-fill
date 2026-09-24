import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { createApp, h, reactive, ref, vModelText, withDirectives } from 'vue';
import { benchmarkCases } from './cases';
import './style.css';
const params = new URLSearchParams(location.search), framework = params.get('framework') ?? 'native';
const scenario = benchmarkCases.find(item => item.id === params.get('case')) ?? benchmarkCases[0];
const defaults = Object.fromEntries(scenario.fields.map(field => [field.name, params.has('prefilled') && field.name === 'fullName' ? 'Existing value' : '']));
const intro = document.createElement('p'); intro.textContent = `${framework} · ${scenario.title}`; document.querySelector('header')!.append(intro);
const pdf = document.createElement('a'); pdf.href = `/generated/${scenario.id}.pdf`; pdf.download = `${scenario.id}.pdf`; pdf.textContent = 'Download matching synthetic PDF'; document.querySelector('header')!.append(pdf);
function ExtraControls() { return <div><label>Password<input type="password" /></label><label>Payment card<input autoComplete="cc-number" /></label><input hidden /><input disabled /><input readOnly /><select aria-label="Unsupported multi-select" multiple><option>Example</option></select></div>; }
function ReactForm() {
  const [values, setValues] = useState(defaults), [render, setRender] = useState(0);
  return <form onSubmit={event => event.preventDefault()}>
    <fieldset><legend>{scenario.context}</legend>{scenario.fields.map(field => <label key={field.name}>{field.label}{field.type === 'textarea'
      ? <textarea name={field.name} value={values[field.name]} onChange={event => setValues(value => ({ ...value, [field.name]: event.target.value }))} />
      : <input name={field.name} type={field.type} value={values[field.name]} onChange={event => setValues(value => ({ ...value, [field.name]: event.target.value }))} />}</label>)}</fieldset>
    <ExtraControls /><button type="button" id="rerender" onClick={() => setRender(value => value + 1)}>Force rerender {render}</button><output id="state">{JSON.stringify(values)}</output>
  </form>;
}
if (framework === 'react') createRoot(document.getElementById('app')!).render(<ReactForm />);
else if (framework === 'vue') {
  createApp({ setup() {
    const values = reactive({ ...defaults }), render = ref(0);
    return () => h('form', { onSubmit: (event: Event) => event.preventDefault() }, [
      h('fieldset', [h('legend', scenario.context), ...scenario.fields.map(field => h('label', [field.label, withDirectives(h(field.type === 'textarea' ? 'textarea' : 'input', {
        type: field.type === 'textarea' ? undefined : field.type, name: field.name,
        'onUpdate:modelValue': (value: string) => { values[field.name] = value; },
      }), [[vModelText, values[field.name]]])]))]),
      h('button', { type: 'button', id: 'rerender', onClick: () => render.value++ }, `Force rerender ${render.value}`),
      h('output', { id: 'state' }, JSON.stringify(values)),
    ]);
  } }).mount('#app');
} else {
  const form = document.createElement('form'), group = document.createElement('fieldset'), legend = document.createElement('legend');
  legend.textContent = scenario.context; group.append(legend); form.append(group);
  for (const field of scenario.fields) {
    const label = document.createElement('label'), control = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
    if (control instanceof HTMLInputElement) control.type = field.type;
    control.name = field.name; control.value = defaults[field.name]; label.append(field.label, control); group.append(label);
  }
  const button = document.createElement('button'); button.type = 'button'; button.id = 'rerender'; button.textContent = 'Refresh state';
  const output = document.createElement('output'); output.id = 'state';
  const update = () => { output.textContent = JSON.stringify(Object.fromEntries(new FormData(form))); };
  form.addEventListener('input', update); form.addEventListener('submit', event => event.preventDefault()); button.onclick = update;
  form.append(button, output); document.getElementById('app')!.append(form); update();
}
