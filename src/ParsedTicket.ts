import * as Product from "./parser/Product";

export class ParsedTicket {
  
  status: string
  result: Result
  

  constructor() {
    this.result = new Result()
  }
}

export class Result {
  trips: Array<Trip>
  custom: Custom
}

export class Trip {
  code: string
  name: string
  details: Details

  constructor() {
    this.details = new Details()
  }
}

export class Details {
  price: Product.Price
  roundTrips: Array<Voyage>
}

export class Voyage {
  type: string
  date: string
  trains: Array<Train>

  constructor(trains: Array<Product.Train>, date: Date, isToGo: boolean) {
    this.type = isToGo ? VoyageType.Aller : VoyageType.Retour
    this.date = date.toISOString().replace("T", " ")
    this.trains = trains.map(t => {
      let train = new Train()
      train.departureTime = t.DepartureTime.ToString()
      train.departureStation = t.DepartureStation
      train.arrivalTime = t.ArrivalTime.ToString()
      train.arrivalStation = t.ArrivalStation
      train.type = t.Type
      train.number = t.Number
      return train 
    })
  }
}

export class VoyageType {
  public static Aller: string = "Aller"
  public static Retour: string = "Retour"
}

export class Train {
  departureTime: string
  departureStation: string
  arrivalTime: string
  arrivalStation: string
  type: string
  number: string
  passengers: Array<Passenger>
}

export class Passenger {
  type: string
  age: string

  constructor(type: Product.PassengerType) {
    this.type = type === Product.PassengerType.ExchangeableAndRefundable ? "échangeable" : "other"
    this.age = "(26 à 59 ans)"
  }
}

export class Custom {
  prices: Array<Price>
}

export class Price {
  value: number
}