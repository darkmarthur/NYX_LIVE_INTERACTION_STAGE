import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
export const TEST_ENV={BRIDGE_SECRET:'only-for-tests-'.repeat(4),APPS_SCRIPT_URL:'https://script.google.com/macros/s/testing/exec',SITE_ORIGIN:'https://nyx.example',LEGAL_APPROVED:'false',PRIVACY_EMAIL:'invalid',COLLECTION_OPEN:'false'};
export const JPEG=Buffer.from([255,216,255,192,0,17,8,0,10,0,10,3,1,17,0,2,17,0,3,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);
export const newId=()=>randomUUID().replaceAll('-','');
export function gasFixture(){
 const clock={value:Date.parse('2026-10-21T18:00:00-06:00')};
 const settings={...TEST_ENV,EVENT_ID:'nyx-ocampo-2026',TERMS_VERSION:'2026-10-15-v2',STORAGE_VERSION:'2',OPENS_AT:'2026-10-08T00:00:00-06:00',CLOSES_AT:'2026-10-22T19:00:00-06:00',PURGE_AT:'2026-10-23T10:00:00-06:00',ROOT_FOLDER_ID:'root',SPREADSHEET_ID:'book',RESPONSE_SHEET_ID:'0',MAX_PER_KIND:'1'};
 const controls={omitZero:true,busy:false,failWriteBefore:false,failWriteAfter:false,failDeleteBefore:false,failDeleteAfter:false,failFinalize:false,failTombstone:false,failPhotoAfter:false};
 const files=new Map([['root',{id:'root',parent:'mydrive',name:'NYX',type:'folder',description:'NYX_MVP:nyx-ocampo-2026'}],['book',{id:'book',parent:'mydrive',type:'sheet',description:'NYX_SHEET:nyx-ocampo-2026'}]]);
 let sheet={rows:[['Pregunta','Respuesta']],metadata:[]};
 const removed=[],batches=[],triggers=[];
 const props={getProperty:k=>settings[k]??null,getProperties:()=>({...settings}),setProperty:(k,v)=>{
   if(controls.failFinalize&&k.startsWith('NYX_ITEM_')&&v.includes('"state":"complete"')){controls.failFinalize=false;throw Error('Properties temporarily unavailable');}
   if(controls.failTombstone&&k.startsWith('NYX_ITEM_')&&v.includes('"state":"withdrawn"')){controls.failTombstone=false;throw Error('Properties temporarily unavailable');}
   settings[k]=v;return props;},setProperties:o=>{Object.assign(settings,o);return props;},deleteProperty:k=>{delete settings[k];return props;}};
 const iter=values=>{let i=0;return{hasNext:()=>i<values.length,next:()=>values[i++]};};
 const get=id=>{if(!files.has(id))throw Error('File not found 404');return files.get(id);};
 const file=id=>({getId:()=>id,getName:()=>get(id).name,getMimeType:()=>get(id).type,getBlob:()=>blob(get(id).value,get(id).type,get(id).name),moveTo:folder=>{get(id).parent=folder.getId();},setDescription:v=>{get(id).description=v;return file(id);},setSharing:()=>file(id)});
 const folder=id=>({...file(id),createFile:value=>{const n=newId();files.set(n,{id:n,parent:id,name:value.name,type:value.type,value:value.value});if(controls.failPhotoAfter){controls.failPhotoAfter=false;throw Error('Photo response lost');}return file(n);},getFilesByName:name=>iter([...files.values()].filter(x=>x.parent===id&&x.name===name).map(x=>file(x.id))),getFiles:()=>iter([...files.values()].filter(x=>x.parent===id&&x.type!=='folder').map(x=>file(x.id))),getFolders:()=>iter([]),getFoldersByName:()=>iter([])});
 const blob=(value,type,name)=>({value,type,name,getDataAsString:()=>typeof value==='string'?value:Buffer.from(value).toString('utf8')});
 const Sheets={Spreadsheets:{DeveloperMetadata:{search:(query,id)=>{
   assert.equal(id,'book');const lookup=query.dataFilters[0].developerMetadataLookup;
   return{matchedDeveloperMetadata:sheet.metadata.filter(x=>x.metadataValue===lookup.metadataValue&&x.metadataKey===lookup.metadataKey).map(x=>{const y=structuredClone(x);if(controls.omitZero&&y.location.dimensionRange.sheetId===0)delete y.location.dimensionRange.sheetId;return{developerMetadata:y};})};
 }},Values:{get:(id,range)=>{assert.equal(id,'book');get('book');return{values:structuredClone(sheet.rows)};}},batchUpdate:(request,id)=>{
   assert.equal(id,'book');const deleting=request.requests.some(x=>x.deleteDimension);
   if((deleting&&controls.failDeleteBefore)||(!deleting&&controls.failWriteBefore))throw Error('Google transient failure');
   const copy=structuredClone(sheet);
   for(const op of request.requests){
    if(op.insertDimension){const r=op.insertDimension.range;assert.equal(r.sheetId,0);assert.ok(r.startIndex>=1);copy.rows.splice(r.startIndex,0,[]);for(const m of copy.metadata){const d=m.location.dimensionRange;if(d.startIndex>=r.startIndex){d.startIndex++;d.endIndex++;}}}
    else if(op.updateCells){const u=op.updateCells;assert.equal(u.start.columnIndex,0);assert.equal(u.rows[0].values.length,2);copy.rows[u.start.rowIndex]=u.rows[0].values.map(c=>{assert.equal(c.userEnteredValue.formulaValue,undefined);return c.userEnteredValue.stringValue;});}
    else if(op.createDeveloperMetadata)copy.metadata.push(structuredClone(op.createDeveloperMetadata.developerMetadata));
    else if(op.deleteDimension){const r=op.deleteDimension.range;assert.equal(r.sheetId,0);assert.equal(r.endIndex,r.startIndex+1);assert.ok(r.startIndex>=1);copy.rows.splice(r.startIndex,1);copy.metadata=copy.metadata.filter(m=>m.location.dimensionRange.startIndex!==r.startIndex);for(const m of copy.metadata){const d=m.location.dimensionRange;if(d.startIndex>r.startIndex){d.startIndex--;d.endIndex--;}}}
    else throw Error('Unhandled Sheets request');
   }
   sheet=copy;batches.push(structuredClone(request));
   if(deleting&&controls.failDeleteAfter){controls.failDeleteAfter=false;throw Error('Deletion response lost');}
   if(!deleting&&controls.failWriteAfter){controls.failWriteAfter=false;throw Error('Write response lost');}
   return{};
 }}};
 const context=vm.createContext({Date:class extends Date{constructor(...a){super(...(a.length?a:[clock.value]));}static now(){return clock.value;}},PropertiesService:{getScriptProperties:()=>props},Utilities:{Charset:{UTF_8:'UTF-8'},getUuid:randomUUID,computeHmacSha256Signature:(text,secret)=>[...createHmac('sha256',secret).update(text).digest()],base64Decode:v=>[...Buffer.from(v,'base64')],newBlob:blob},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})},LockService:{getScriptLock:()=>({tryLock:()=>!controls.busy,releaseLock(){}})},DriveApp:{getFolderById:folder,getFileById:file,Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'}},Drive:{Files:{get:id=>({...get(id),parents:[get(id).parent]}),remove:id=>{get(id);if(controls.failDeleteBefore)throw Error('Delete denied');for(const x of [...files.values()])if(x.parent===id)files.delete(x.id);files.delete(id);removed.push(id);if(controls.failDeleteAfter){controls.failDeleteAfter=false;throw Error('Deletion response lost');}}}},Sheets,ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:t=>{const i=triggers.indexOf(t);if(i>=0)triggers.splice(i,1);}},console:{log(){}}});
 vm.runInContext(readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
 const common=()=>({eventId:settings.EVENT_ID,termsVersion:settings.TERMS_VERSION,opensAt:settings.OPENS_AT,closesAt:settings.CLOSES_AT,purgeAt:settings.PURGE_AT,actor:'a'.repeat(64)});
 function envelope(data){const ts=clock.value,nonce=newId(),payload=Buffer.from(JSON.stringify({...common(),...data})).toString('base64');return{ts,nonce,payload,signature:createHmac('sha256',settings.BRIDGE_SECRET).update(`${ts}.${nonce}.${payload}`).digest('hex')};}
 const post=body=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).text);
 const send=data=>{clock.value++;return post(envelope(data));};
 const backend=async(operation,data)=>{const r=send({...data,operation});if(!r.ok)throw Error(r.code);return r.data;};
 return{clock,settings,controls,files,batches,context,props,send,post,envelope,backend,removed,sheet:()=>sheet};
}
