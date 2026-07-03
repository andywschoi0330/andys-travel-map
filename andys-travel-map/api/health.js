module.exports = async function handler(req, res) {
  res.status(200).json({ok: true, service: 'andys-travel-map-api'});
};
