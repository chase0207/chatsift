module.exports = {
  appointmentFields: ['name', 'city', 'time', 'contact', 'pickup_location', 'car_type'],
  priceFields: ['city', 'car_type'],
  validity: {
    contactRegex: /^1[3-9]\d{9}$/,
    wechatRegex: /^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/,
    cityList: ['上海', '北京', '广州', '深圳', '杭州', '南京', '成都', '武汉', '苏州', '无锡', '天津', '重庆'],
    carTypeList: ['轿车', 'SUV', '商务车', '7座', '七座', '七座车', 'MPV', '新能源', '电车', '油车'],
    invalidNameWords: ['不知道', '老板', '问问', '无', '没有', '暂定', '客户', '先生', '女士'],
    vagueTimeWords: ['改天', '有空', '再说', '最近', '以后', '回头', '方便时'],
    vagueLocationWords: ['市区', '城区', '附近', '周边', '这边', '那边', '浦东', '浦西'],
  },
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
