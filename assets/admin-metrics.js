// Pure, read-only summary of documents already fetched from Firebase.
// No estimated revenue: credits/debits are stars, not verified cash payments.
const list = value => Array.isArray(value) ? value : [];
const int = value => Number.isSafeInteger(value) ? value : 0;
const sum = (items, project) => list(items).reduce((total, item) => total + int(project(item)), 0);

export function summarizeAdmin(source = {}, now = Date.now()) {
  const ads = list(source.ads), stores = list(source.stores);
  const pendingAds = list(source.pend), pendingStores = list(source.pendStores);
  const services = list(source.sorders), sponsors = list(source.sp);
  const transactions = list(source.transactions), users = list(source.users);
  const authorizedOwner = source.isOwner === true;

  const publicStats = {
    publishedAds: ads.filter(item => item.status === "approved").length,
    publishedStores: stores.filter(item => item.status === "approved").length,
    featuredAds: ads.filter(item => item.status === "approved" && Number(item.featuredUntil || 0) > now).length,
    activeStorePlans: stores.filter(item => item.status === "approved" && Number(item.planUntil || 0) > now && item.plan && item.plan !== "free").length,
    activeSponsors: sponsors.filter(item => item.active === true &&
      Number(item.from || 0) <= now && Number(item.to || 0) > now).length
  };
  const pending = {
    ads: pendingAds.filter(item => item.status === "pending").length,
    stores: pendingStores.filter(item => item.status === "pending").length,
    serviceOrders: services.filter(item => item.status === "new" || item.status === "progress").length,
    finance: authorizedOwner ?
      list(source.orders).filter(item => item.status === "pending").length +
      list(source.promos).filter(item => item.status === "pending").length +
      list(source.subs).filter(item => item.status === "pending").length +
      list(source.pendingSponsorRequests).filter(item => item.status === "pending").length
      : null
  };
  const owner = authorizedOwner ? {
    users: users.length,
    walletStars: sum(users, item => item.stars),
    creditedStars: sum(transactions.filter(item => Number(item.amount) > 0), item => item.amount),
    debitedStars: sum(transactions.filter(item => Number(item.amount) < 0), item => -item.amount),
    ledgerEntries: transactions.length
  } : null;
  return { publicStats, pending, owner };
}
