module.exports = {
  appointmentFields: ['name', 'city', 'time', 'contact', 'pickup_location', 'car_type'],
  priceFields: ['city', 'car_type'],
  leadScore: {
    intentBase: {
      appointment: 50,
      price_inquiry: 35,
      simple_inquiry: 15,
      complaint: 10,
    },
    completenessFactor: 0.3,
    contactBonus: 15,
    stageBonus: {
      completing: 10,
      done: 15,
    },
  },
}
