"use strict";
// Pure domain logic only. Not an authorization or payment endpoint.
function integer(n,min,max){if(!Number.isSafeInteger(n)||n<min||n>max)throw new RangeError("Invalid integer amount");return n;}

function quoteSale({amountMinor,discountBps,commissionBps,cashbackBps,surveyBps=0,currency}){
  integer(amountMinor,1,1e10); for(const rate of [discountBps,commissionBps,cashbackBps,surveyBps])integer(rate,0,10000);
  if(!["SYP","USD","IQD","AED"].includes(currency))throw new Error("Unsupported currency");
  if(cashbackBps+surveyBps>commissionBps)throw new Error("Rewards exceed commission");
  const portion=(base,rate)=>Math.floor(base*rate/10000);
  const discountMinor=portion(amountMinor,discountBps),paidMinor=amountMinor-discountMinor;
  const commissionMinor=portion(paidMinor,commissionBps),cashbackMinor=portion(paidMinor,cashbackBps),surveyReserveMinor=portion(paidMinor,surveyBps);
  return {currency,amountMinor,discountMinor,paidMinor,commissionMinor,cashbackMinor,surveyReserveMinor,platformNetMinor:commissionMinor-cashbackMinor-surveyReserveMinor,merchantNetMinor:paidMinor-commissionMinor};
}

function confirmSale(sale,{actorUid,amountMinor,now}){
  if(!sale||!sale.customerUid||!sale.merchantUid||sale.customerUid===sale.merchantUid)throw new Error("Invalid participants");
  if(actorUid!==sale.customerUid&&actorUid!==sale.merchantUid)throw new Error("Unauthorized participant");
  integer(amountMinor,1,1e10);integer(now,0,Number.MAX_SAFE_INTEGER);
  if(!["issued","pending"].includes(sale.status))throw new Error("Sale is closed");
  if(now>=sale.expiresAt)throw new Error("Coupon expired");
  const side=actorUid===sale.customerUid?"customer":"merchant";
  const confirmations={...sale.confirmations};
  if(confirmations[side]!==undefined){if(confirmations[side]!==amountMinor)throw new Error("Confirmation cannot be changed");return {...sale};}
  confirmations[side]=amountMinor;
  let status="pending",financials=null;
  if(confirmations.customer!==undefined&&confirmations.merchant!==undefined){
    status=confirmations.customer===confirmations.merchant?"confirmed":"disputed";
    if(status==="confirmed")financials=quoteSale({...sale.terms,amountMinor});
  }
  return {...sale,confirmations,status,financials,settlementStatus:status==="confirmed"?"awaiting_collection":"not_payable"};
}

function surveyAllocation({budgetMinor,rewardMinor,maxResponses,currency}){
  integer(budgetMinor,1,1e10);integer(rewardMinor,1,1e10);integer(maxResponses,1,1000000);
  if(!["SYP","USD","IQD","AED"].includes(currency))throw new Error("Unsupported currency");
  if(rewardMinor>Math.floor(budgetMinor/maxResponses))throw new Error("Insufficient survey budget");
  return {currency,budgetMinor,rewardMinor,maxResponses,reservedMinor:rewardMinor*maxResponses,unallocatedMinor:budgetMinor-rewardMinor*maxResponses};
}
module.exports={quoteSale,confirmSale,surveyAllocation};
