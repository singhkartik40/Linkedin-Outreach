const indianPlace = /\b(?:india|bengaluru|bangalore|mumbai|bombay|delhi|noida|gurugram|gurgaon|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|surat|lucknow|chandigarh|kochi|cochin|indore|bhopal|nagpur|vadodara|thiruvananthapuram|visakhapatnam|andhra pradesh|karnataka|maharashtra|telangana|tamil nadu|uttar pradesh|west bengal|gujarat|kerala|rajasthan|punjab|haryana)\b/i;
const metroPlace = /\b(?:bengaluru|bangalore|mumbai|bombay|delhi|new delhi|noida|gurugram|gurgaon|hyderabad|pune|chennai|kolkata)\b/i;
export function isIndianLocation(location) { return indianPlace.test(String(location || '')); }
export function isIndianMetroLocation(location) { return metroPlace.test(String(location || '')); }
export function matchesContactToJobLocation(jobLocation, personLocation) {
  const job = String(jobLocation || '').trim();
  const outsideIndia = job && !isIndianLocation(job) && !/^(?:remote|anywhere|worldwide|global|location not shown)$/i.test(job);
  return outsideIndia ? true : isIndianLocation(personLocation);
}
export function matchesCity(location, cities = ['India'], country = '', searchLocation = '') {
  if (!Array.isArray(cities) || cities.length === 0 || cities.includes('India')) return country === 'India' || isIndianLocation(location);
  const normalize = value => String(value || '').toLowerCase().replace(/bangalore/g, 'bengaluru').replace(/gurgaon/g, 'gurugram').replace(/bombay/g, 'mumbai');
  const visible = normalize(location);
  const searched = normalize(searchLocation).split(',')[0].trim();
  return cities.some(city => {
    const selected = normalize(city).split(',')[0].trim();
    return visible.includes(selected) || (searched && searched === selected);
  });
}
