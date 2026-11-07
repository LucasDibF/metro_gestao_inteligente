/**
 * The reviewer profile the local demo seed and the load test give their engineer account. It must
 * pass the profile validation and still never pass for a real engineer on an issued PDF: the name
 * says it is fictitious, the CREA number is all zeros and the title, printed next to the name,
 * says the registration has no validity.
 */
const demoReviewerProfile = Object.freeze({
  fullName: 'Engenheira Demonstração (fictícia)',
  creaNumber: '000000',
  creaUf: 'SP',
  professionalTitle: 'Engenheira Civil (demonstração, sem validade)',
});
/** The unmarked profile the scripts wrote before; only this exact one is replaced on a rerun. */
const legacyDemoReviewerProfile = Object.freeze({
  fullName: 'Engenheira Demonstração',
  creaNumber: '123456',
  creaUf: 'SP',
  professionalTitle: 'Engenheira Civil',
});
const requiredFields = ['fullName', 'creaNumber', 'creaUf', 'professionalTitle'];

/**
 * True when the profile read from GET /perfil-profissional must be written with the demo values:
 * it is incomplete, or it is exactly the old unmarked demo profile. Any other complete profile is
 * kept as it is.
 */
function needsDemoReviewerProfile(profile) {
  if (!profile.complete) return true;
  return requiredFields.every((field) => profile[field] === legacyDemoReviewerProfile[field]);
}
/** PUT body with the demo values; the optional contact fields and the read version are kept. */
function demoReviewerProfileBody(profile) {
  return {
    ...demoReviewerProfile,
    phone: profile.phone,
    professionalEmail: profile.professionalEmail,
    version: profile.version,
  };
}
module.exports = {
  demoReviewerProfile,
  legacyDemoReviewerProfile,
  needsDemoReviewerProfile,
  demoReviewerProfileBody,
};
