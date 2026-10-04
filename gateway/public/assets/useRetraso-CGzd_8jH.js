import{r}from"./index-CCSCBfSX.js";function c(t,e=350){const[s,o]=r.useState(t);return r.useEffect(()=>{const u=setTimeout(()=>o(t),e);return()=>clearTimeout(u)},[t,e]),s}export{c as u};
