export enum ProductType {
  Card,
  Misc,
  Voyage,
}

export class Product {
  Type: ProductType
  Payload: Card | Voyage | Misc
  Price: Price
}

export class Price {
  Euros: number
  Cents: number

  public toNumber(): number {
    return Number(this.Euros) + Number(this.Cents) / 100
  }

  public toJSON(): any {
    return this.toNumber()
  }
}

export class Voyage {
  Info: VoaygeInfo
  ToGo: Array<Train>
  ToReturn: Array<Train>
}

export class VoaygeInfo {
  Departure: string
  Destination: string
}

export class Train {
  Date: VoyageDate
  DepartureTime: VoyageTime
  DepartureStation: string
  ArrivalTime: VoyageTime
  ArrivalStation: string
  Type: string
  Number: string
  Passengers: Array<Passenger>
}

export class Passenger {
  age: string
  type: PassengerType
}

export enum PassengerType {
  ExchangeableAndRefundable,
  Default,
}

export class VoyageDate {
  Day: number
  Month: number
}

export class VoyageTime {
  hours: number
  minutes: number

  public ToString() {
    let timeToStr = (t: number) => {
      let timeStr = String(t)
      if (timeStr.length < 2) {
        timeStr = "0" + timeStr
      }
      return timeStr
    }
    return timeToStr(this.hours) + ":" + timeToStr(this.minutes)
  }
}

export class Card {}

export class Misc {}