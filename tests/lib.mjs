export const state={pass:0,fail:0,failed:[]};
export async function t(name,fn){try{await fn();state.pass++;console.log('  ok   '+name)}catch(e){state.fail++;state.failed.push(name);console.log('  FAIL '+name+'\n       '+String(e&&e.message||e).split('\n')[0])}}
