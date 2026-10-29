import { createStore } from '../server/store.mjs';
export function seedTracker(directory) {
  const store = createStore(directory);
  store.set('tracker', { title:'Test tracker', rowCount:0, schemaValid:true, tabs:['Master'], missingTabs:[], missingHeaders:[], headers:['Person','Company','Profile URL','Status','Job / funding source','Sent on (IST)'], syncedAt: new Date().toISOString(), valueRanges: [{range:"'Master'!A:ZZ",values:[['Person','Company','Profile URL','Status','Job / funding source','Sent on (IST)']]}] });
  store.close();
}
