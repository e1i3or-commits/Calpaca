import {expect,test} from "bun:test";
import {createSesFeedbackRoutes,type SesFeedbackDeps} from "../../src/api/routes/ses-feedback";
const binding={topicArn:"arn:aws:sns:us-east-1:123456789012:synthetic",sendingAccountId:"123456789012",configurationSet:"synthetic"};
test("SES adapter endpoint requires its own secret, bounded valid input and complete source configuration",async()=>{
 let calls=0;
 const deps:SesFeedbackDeps={secret:()=>"synthetic-secret",binding:()=>binding,record:async()=>{calls++;return {kind:"recorded"};}};
 const app=createSesFeedbackRoutes(deps),input={Type:"Notification",TopicArn:binding.topicArn,MessageId:crypto.randomUUID(),Message:"{}"};
 const post=(body:unknown,secret="synthetic-secret")=>app.request("/api/webhooks/ses-onboarding",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${secret}`},body:JSON.stringify(body)});
 expect((await post(input,"wrong")).status).toBe(401);expect(calls).toBe(0);
 expect((await post({...input,Type:"SubscriptionConfirmation"})).status).toBe(400);
 expect((await post({...input,Message:"a".repeat(260_000)})).status).toBe(413);
 deps.binding=()=>null;expect((await post(input)).status).toBe(503);expect(calls).toBe(0);
 deps.binding=()=>binding;
 const success=await post({...input,Signature:"ignored-provider-metadata"});expect(success.status).toBe(200);expect(success.headers.get("cache-control")).toBe("no-store");expect(calls).toBe(1);
 deps.record=async()=>({kind:"duplicate"});expect(await (await post(input)).json()).toEqual({kind:"duplicate"});
 deps.record=async()=>({kind:"receipt_conflict"});expect((await post(input)).status).toBe(409);
 deps.secret=()=>undefined;expect((await post(input)).status).toBe(404);
});
