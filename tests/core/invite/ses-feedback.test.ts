import { expect,test } from "bun:test";
import { normalizeSesNotification,sesInviteHeaders,sesMessageKey,type SesNotification } from "../../../src/core/invite/ses-feedback";
const id="00000000-0000-4000-8000-000000000001";
const binding={topicArn:"arn:aws:sns:us-east-1:123456789012:synthetic-feedback",sendingAccountId:"123456789012",configurationSet:"synthetic-onboarding"};
const mail=()=>({sendingAccountId:binding.sendingAccountId,messageId:"SES-overwritten-id",destination:["One@Example.Invalid","two@example.invalid"],
 tags:{"ses:configuration-set":[binding.configurationSet],calpaca_delivery_id:[id],calpaca_message_key:[sesMessageKey("<original>")]}});
function envelope(event:unknown):SesNotification {return {Type:"Notification",TopicArn:binding.topicArn,MessageId:crypto.randomUUID(),Message:JSON.stringify(event)};}
test("SMTP tags survive SES message-ID replacement and delivery uses explicit recipients only",()=>{
 const headers=sesInviteHeaders(id,"<original>",binding.configurationSet);
 expect(headers["X-SES-CONFIGURATION-SET"]).toBe(binding.configurationSet);
 expect(headers["X-SES-MESSAGE-TAGS"]).toBe(`calpaca_delivery_id=${id},calpaca_message_key=${sesMessageKey("<original>")}`);
 expect(()=>sesInviteHeaders(id,"<original>","set\r\nInjected: yes")).toThrow();
 const result=normalizeSesNotification(envelope({eventType:"Delivery",mail:mail(),delivery:{recipients:["One@Example.Invalid"]}}),binding);
 expect(result).toMatchObject({kind:"normalized",deliveryId:id,providerMessageId:"SES-overwritten-id",recipients:["one@example.invalid"],destination:["one@example.invalid","two@example.invalid"],status:"delivered"});
});
test("bounce, complaint, reject and rendering failure retain distinct negative outcomes",()=>{
 for(const [eventType,details,status] of [
  ["Bounce",{bounce:{bouncedRecipients:[{emailAddress:"one@example.invalid"}]}},"bounced"],
  ["Complaint",{complaint:{complainedRecipients:[{emailAddress:"one@example.invalid"}]}},"complained"],
  ["Reject",{reject:{reason:"Bad content"}},"rejected"],
  ["Rendering Failure",{failure:{errorMessage:"Synthetic template failure"}},"rendering_failed"],
 ] as const) {
  const result=normalizeSesNotification(envelope({eventType,mail:mail(),...details}),binding);
  expect(result).toMatchObject({kind:"normalized",status});
  if(result.kind==="normalized")expect(result.recipients).toHaveLength(eventType==="Reject"||eventType==="Rendering Failure"?2:1);
 }
});
test("wrong sources, ambiguous tags, unrelated recipients and nonfinal events cannot claim delivery",()=>{
 const good=envelope({eventType:"Delivery",mail:mail(),delivery:{recipients:["one@example.invalid"]}});
 expect(normalizeSesNotification({...good,TopicArn:binding.topicArn+"-other"},binding).kind).toBe("source_mismatch");
 for(const patch of [{sendingAccountId:"999999999999"},{tags:{...mail().tags,"ses:configuration-set":["other"]}}])expect(normalizeSesNotification(envelope({eventType:"Delivery",mail:{...mail(),...patch},delivery:{recipients:["one@example.invalid"]}}),binding).kind).toBe("source_mismatch");
 for(const tags of [{...mail().tags,calpaca_delivery_id:[id,id]},{...mail().tags,calpaca_message_key:[]}])expect(normalizeSesNotification(envelope({eventType:"Delivery",mail:{...mail(),tags},delivery:{recipients:["one@example.invalid"]}}),binding).kind).not.toBe("normalized");
 for(const recipients of [["stranger@example.invalid"],["one@example.invalid","ONE@example.invalid"]])expect(normalizeSesNotification(envelope({eventType:"Delivery",mail:mail(),delivery:{recipients}}),binding).kind).toBe("recipient_mismatch");
 for(const eventType of ["Send","Open","Click","DeliveryDelay","Unknown"])expect(normalizeSesNotification(envelope({eventType,mail:mail()}),binding).kind).toBe("invalid_event");
 expect(normalizeSesNotification({...good,Message:"invalid JSON"},binding).kind).toBe("invalid_event");
});
