import * as Cheerio from 'cheerio'


import IParser from './IParser'
import * as ParsedTicket from '../ParsedTicket'
import * as Product from './Product'
import * as Travel from './Travel'

const monthsFr = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Julliet", "Août", "Septembre", "Octobre", "Novembre", "Decembre"]

class CheerioParser implements IParser {
  private $: CheerioStatic
  
  private priceRe: RegExp
  private voyageDateRe: RegExp
  private passengerAgeRe: RegExp
  private travelToGoToReturnDepartureDestinationRe: RegExp
  private travelDateRe: RegExp

  constructor() {
    this.priceRe = new RegExp(/\d+,\d{2}(?= *€)/)
    this.voyageDateRe = new RegExp(/(?<=[A-Za-z] )\d{1,2} +[A-Za-z]+/)
    this.passengerAgeRe = new RegExp(/\(\d{1,2} à \d{1,2} ans\)/)
    this.travelToGoToReturnDepartureDestinationRe = new RegExp(/[A-Z]+[ \t]+[\u202F\u00A0]*<>[\u202F\u00A0][ \t]+[A-Z]+/)
    this.travelDateRe = new RegExp(/\d{2}\/\d{2}\/\d{4}/g)
  }

  public async Parse(file: Buffer): Promise<ParsedTicket.ParsedTicket> {
    return new Promise<ParsedTicket.ParsedTicket>((resolve) => {
      this.createCheerioStatic(file)
      let parsedTicket = new ParsedTicket.ParsedTicket()
      this.fillStatus(parsedTicket)
      this.fillResult(parsedTicket)
      return resolve(parsedTicket)  
    })
  }

  private static checkSingle(el: Cheerio) {
    if (!el || el.length === 0) {
      throw "did not find any elment"
    }
    if (el.length === 1) {
      return
    }
    if (el.length > 0) {
      throw "expected to find a single element, found " + el.length + " elements"
    }
  }

  private extractProductPrice(s: string): Product.Price {
    const matches = s.match(this.priceRe)
    this.extractLengthCheck(matches, "price", 1)
    const priceParts = matches[0].toString().split(',')
      .map(p => Number(p))
    let price = new Product.Price()
    price.Euros = priceParts[0]
    price.Cents = priceParts[1]
    return price
  }

  private extractVoyageDate(s: string): Product.VoyageDate {
    const matches = s.match(this.voyageDateRe)
    this.extractLengthCheck(matches, "date", 1)
    const dateParts = matches[0].toString().split(" ")
    let date = new Product.VoyageDate()
    date.Day = Number(dateParts[0])
    const monthStr = dateParts[dateParts.length - 1]
    let monthIdx = -1
    for (let i = 0; i < monthsFr.length; i++) {
      if (monthsFr[i] === monthStr) {
        monthIdx = i
        break
      }
    }
    if (monthIdx === -1) {
      throw "month " + monthStr + " was not found"
    }
    date.Month = monthIdx
    return date
  }

  private extractVoyageTime(s: string): Product.VoyageTime {
    const voyageTimeParts = s.split("h")
    if (voyageTimeParts.length !== 2) {
      throw "expected to have 2 parts of voyage time, actually have " + voyageTimeParts.length
    }
    let voyageTime = new Product.VoyageTime()
    voyageTime.hours = Number(voyageTimeParts[0])
    voyageTime.minutes = Number(voyageTimeParts[1])
    return voyageTime
  }

  private extractPassengerAge(s: string): string {
    const matches = s.match(this.passengerAgeRe)
    this.extractLengthCheck(matches, "passengerAge", 1)
    return matches[0].toString()
  }

  private extractTravelToGoToReturnDepartureDestination(s: string): string[] {
    const matches = s.match(this.travelToGoToReturnDepartureDestinationRe)
    this.extractLengthCheck(matches, "travel departure and destination", 1)
    const depDest = matches[0].toString().split("<>").map(e => e.trim()) 
    return depDest
  }

  private extractTravelDates(s: string): string[] {
    let matches = s.match(this.travelDateRe)
    return matches.map(m => m.toString())
  }

  private extractLengthCheck(matches: RegExpMatchArray, matchingWhat: string, expected: number) {
    if (!matches) {
      throw "RegExp match array is null or undefined"
    }
    if (matches.length !== expected) {
      throw "problem when matching " + matchingWhat + ": expected to find " + expected + " matches, actually found: " + matches.length
    }
  }

  private visitProduct(c: Cheerio): boolean {
    const productVisitedProp = "cheerio-product-visited"
    if (c.prop(productVisitedProp)) {
      return false
    }
    c.prop(productVisitedProp, true)
    return true
  }

  private cheerioElsToCheerios(cheerioEls: Cheerio): Array<Cheerio> {
    let cheerios = new Array<Cheerio>()
    for(let i = 0; i < cheerioEls.length; i++) {
      cheerios.push(this.$(cheerioEls[i]))
    }
    return cheerios
  }

  private async createCheerioStatic(contents: Buffer): Promise<void> {
    // TODO (SSH): can we do better with errors handling?
    const contentsStr = contents.toString().replace(/\\\"/g, "\"")
    this.$ = Cheerio.load(contentsStr)
  }

  private fillStatus(ticket: ParsedTicket.ParsedTicket) {
    const title = this.$('#intro-title')
    let status = ""
    switch (title.text()) {
      case "Confirmation de votre commande":
        status = "ok"
        break
      default:
        throw "Cannot treat the text \"" + title.text() + "\" in the intro-title"
    }
    ticket.status = status
  }

  private fillResult(ticket: ParsedTicket.ParsedTicket) {
    const products = this.getProducts()
    const travels = this.getTravels()
    this.fillTrips(products, travels, ticket)
    this.fillCustom(products, ticket)
  }

  private fillTrips(products: Array<Product.Product>, travels: Array<Travel.Travel>, ticket: ParsedTicket.ParsedTicket) {
    const tripsTables = this.getAllTripsTables()
    if (tripsTables.length > 0) {
      ticket.result.trips = new Array()
    }
    for(let i = 0; i < tripsTables.length; i++) {
      let tripEl = this.$(tripsTables[i])
      ticket.result.trips.push(this.getTrip(products, travels, tripEl))
    }
  }

  /**
   * Returns a Cheerio that represents all trips found in the document.
   * 
   * In the example, the table that contains the details of the trip has an ID 'block-travel'.
   * As the children divs has IDs of the format 'travel-*', I think, that the block-travels may have the same naming rules.
   * That's why I select all the tables the IDs of which start with 'block-travel'.
   */
  private getAllTripsTables(): Cheerio {
    return this.$("table [id^=block-travel]")
  }

  private getTrip(products: Array<Product.Product>, travels: Array<Travel.Travel>, tripEl: Cheerio): ParsedTicket.Trip {
    let trip = new ParsedTicket.Trip()
    this.fillReference(tripEl, trip)
    this.fillDetails(products, travels, trip)
    return trip
  }

  private fillReference(tripEl: Cheerio, trip: ParsedTicket.Trip) {
    let reductionRefBlock = this.$(this.getReductionReferenceBlock(tripEl))
    trip.code = reductionRefBlock.find("td.pnr-ref > span.pnr-info").text().trim()
    trip.name = reductionRefBlock.find("td.pnr-name > span.pnr-info").text().trim()
  }

  private getReductionReferenceBlock(tripEl: Cheerio): CheerioElement {
    let referenceBlocks = tripEl.find("table.block-pnr")
    return referenceBlocks[referenceBlocks.length - 1]
  }

  private fillDetails(products: Array<Product.Product>, travels: Array<Travel.Travel>, trip: ParsedTicket.Trip) {
    let totalPrice = this.getTotalPrice()
    trip.details.price = totalPrice
    trip.details.roundTrips = new Array()
    const voyages = products.filter(p => p.Type === Product.ProductType.Voyage).map(p => p.Payload as Product.Voyage)
    voyages.forEach(v => {
      v.ToGo.forEach(t => {
        let travelWithDate = travels.find(travel => {
          return travel.Departure === v.Info.Departure
          && travel.Destanation === v.Info.Destination
          && t.Date.Day === travel.ToGoDate.getDate()
          && t.Date.Month === travel.ToGoDate.getMonth()
        })
        if (!travelWithDate) {
          throw "no travel date found"
        }
        trip.details.roundTrips.push(new ParsedTicket.Voyage([t], travelWithDate.ToGoDate, true))
      })
      v.ToReturn.forEach(t => {
        let travelWithDate = travels.find(travel => {
          return travel.Departure === v.Info.Departure
          && travel.Destanation === v.Info.Destination
          && t.Date.Day === travel.ToReturnDate.getDate()
          && t.Date.Month === travel.ToReturnDate.getMonth()
        })
        if (!travelWithDate) {
          throw "no travel date found"
        }
        trip.details.roundTrips.push(new ParsedTicket.Voyage([t], travelWithDate.ToReturnDate, false))
      })
    })
    // This is the part I did not really understand. Normally, it should not be implemented like this.
    // However, I decided to follow the instructions precisely and just comply to the format given in the
    // example file.
    //
    
    this.fillPassengers(trip.details, voyages)
  }

  // I checked the passenger groups. If all the passenger groups are equal, fill only the last trip
  // to not duplicate the data.
  
  // In the example, passenger age is not set correctly, so I hardcoded the age values for the passengers.
  // The problem with this implementation is that it does not compare the names of the passengers in the group:
  // I did not implement that to keep things simpler.
  // This algorithm is easy to alter, as the information about the passengers is parsed.
  private fillPassengers(tripDetails: ParsedTicket.Details, voyages: Array<Product.Voyage>) {
    let passengerGroups = new Array<Array<Product.Passenger>>()
    voyages.forEach(v => {
      v.ToGo.forEach(t => {
        passengerGroups.push(t.Passengers)
      })
      v.ToReturn.forEach(t => {
        passengerGroups.push(t.Passengers)
      })
    })
    let firstGroup = passengerGroups[0]
    for (let i = 1; i < passengerGroups.length; i++) {
      let currGroup = passengerGroups[i]
      if (!this.arePassengerGroupsEqual(firstGroup, currGroup)) {
        throw "passenger group " + i + " is not equal to the first passenger group"
      }
    }
    let lastRoundTrip = tripDetails.roundTrips[tripDetails.roundTrips.length - 1]
    lastRoundTrip.trains[0].passengers = firstGroup.map(p => {
      return new ParsedTicket.Passenger(p.type)
    })
  }

  private arePassengerGroupsEqual(first: Array<Product.Passenger>, second: Array<Product.Passenger>): boolean {
    if (!first && !second) {
      return true
    }
    if (!first || !second) {
      return false
    }
    if (first.length !== second.length) {
      return false
    }
    for (let i = 0; i < first.length; i++) {
      if ((first[i].age !== second[i].age) || (first[i].type !== second[i].type)) {
        return false
      }
    }
    return true
  }

  private fillCustom(products: Array<Product.Product>, ticket: ParsedTicket.ParsedTicket) {
    ticket.result.custom = new ParsedTicket.Custom()
    ticket.result.custom.prices = products.map(p => {
      const price = new ParsedTicket.Price()
      price.value = p.Price.toNumber()
      return price
    })
  }

  private getTotalPrice(): Product.Price {
    const totalToPayEl = this.$("#block-payment").find("table.total-amount").find("td.very-important")
    CheerioParser.checkSingle(totalToPayEl)
    const totalToPay = this.extractProductPrice(totalToPayEl.text())
    return totalToPay
  }

  private getProducts(): Array<Product.Product> {
    let products = this.getCards()
    products = this.getVoayges().concat(products)
    return products
  }

  private getCards(): Array<Product.Product> {
    let cardsBlock = this.$("#cards").find(".product-header")
    return this.cheerioElsToCheerios(cardsBlock)
      .map(c => {
        if (!this.visitProduct(c)) {
          return
        }
        return this.getCard(c)
      })
  }

  private getCard(c: Cheerio): Product.Product {
    let card = new Product.Product()
    card.Type = Product.ProductType.Card
    try {
      card.Price = this.extractCardPrice(c)
    }
    catch(e) {
      throw "error during parsing the card \n" + c.html() + "\n: " + e
    }
    card.Payload = new Product.Card()
    return card
  }

  private extractCardPrice(c: Cheerio): Product.Price {
    let amountTd = c.find("td.amount")
    CheerioParser.checkSingle(amountTd)
    const price = this.extractProductPrice(amountTd.text())
    return price
  }

  private getVoayges(): Array<Product.Product> {
    const commands = this.$("#block-command")
    CheerioParser.checkSingle(commands)
    return this.cheerioElsToCheerios(this.$(".product-header"))
      .map(c => {
        if (this.getProductType(c) === Product.ProductType.Voyage) {
          return this.getVoyage(c)
        }
      })
      .filter(v => { return v })
  }

  private getProductType(c: Cheerio): Product.ProductType {
    const cardName = c.find(".card-name")
    if (cardName.length > 1) {
      throw cardName.length + " card name elements have been found`"
    }
    if (cardName.length === 1) {
      return Product.ProductType.Card
    }
    const prodTypeImg = c.find(".product-type > img")
    CheerioParser.checkSingle(prodTypeImg)
    const prodTypeImgAlt = prodTypeImg.attr("alt")
    switch(prodTypeImgAlt) {
      case "Train Aller-retour":
        return Product.ProductType.Voyage
      default:
        break
    }
    return Product.ProductType.Misc
  }

  private getVoyage(c: Cheerio): Product.Product {
    let product = new Product.Product()
    product.Type = Product.ProductType.Voyage
    let voyage = new Product.Voyage()
    voyage.Info = this.getVoyageInfo(c)
    this.fillVoyageTrips(voyage, c)
    product.Payload = voyage
    product.Price = this.getVoyagePrice(c)
    return product
  }

  private getVoyageInfo(c: Cheerio): Product.VoaygeInfo {
    const depDestEl = c.find("p.od")
    CheerioParser.checkSingle(depDestEl)
    const depDest = depDestEl.text().split("  ")
    if (depDest.length !== 2) {
      throw "expected Deprture-Destination to contain 2 strings, actually contains " + depDest.length + " strings"
    }
    const voyageInfo = new Product.VoaygeInfo()
    voyageInfo.Departure = depDest[0]
    voyageInfo.Destination = depDest[1]
    return voyageInfo
  }

  private fillVoyageTrips(voyage: Product.Voyage, c: Cheerio) {
    voyage.ToGo = new Array()
    voyage.ToReturn = new Array()
    let currDate: Product.VoyageDate = null
    let currTrain: Product.Train = null
    let currTable = c.next("table")
    let isToGo = true
    for (;;) {
      // TODO(SSH): do we need OR here?
      if (!currTable || !currTable.html()) {
        break
      }
      const dateEl = currTable.find("td.product-travel-date")
      if (dateEl.html()) {
        CheerioParser.checkSingle(dateEl)
        currDate = this.extractVoyageDate(dateEl.text())
      }
      if (currTable.hasClass("product-details")) {
        currTrain = this.getTrain(currTable)
        currTrain.Date = currDate
        const travelWay = currTable.find(".travel-way")
        CheerioParser.checkSingle(travelWay)
        switch(travelWay.text().trim()) {
          case "Aller":
            isToGo = true
            break
          case "Retour":
            isToGo = false
            break
          default:
            throw "unknown travel way: " + travelWay.text()
        }
      }
      if (currTable.hasClass("passengers")) {
        currTrain.Passengers = this.getPassengers(currTable)
        let container = isToGo ? voyage.ToGo : voyage.ToReturn
        container.push(currTrain)
      }
      currTable = currTable.next("table")
    }
  }

  private getPassengers(c: Cheerio): Array<Product.Passenger> {
    let passengers = new Array<Product.Passenger>()
    const trs = this.cheerioElsToCheerios(c.find("tr"))
    trs.forEach(tr => {
      const tds = tr.find("td")
      if (tds.length === 1 && tds.hasClass("spacer")) {
        return
      }
      let passenger = new Product.Passenger()
      passenger.age = this.getPassengerAge(tr)
      passenger.type = this.getPassengerType(tr)
      passengers.push(passenger)
    })
    return passengers
  }

  private getPassengerAge(c: Cheerio): string {
    const typology = c.find("td.typology")
    if (!typology || !typology.html()) {
      throw "no typology found"
    }
    const age = this.extractPassengerAge(typology.text())
    return age
  }

  private getPassengerType(c: Cheerio): Product.PassengerType {
    const details = c.find("td.fare-details")
    if (details.text().indexOf("Billet échangeable et remboursable")) {
      return Product.PassengerType.ExchangeableAndRefundable
    }
    return Product.PassengerType.ExchangeableAndRefundable
  }

  private getTrain(c: Cheerio): Product.Train {
    const train = new Product.Train()
    const departureTimeEl = c.find(".origin-destination-hour.segment-departure")
    CheerioParser.checkSingle(departureTimeEl)
    train.DepartureTime = this.extractVoyageTime(departureTimeEl.text())
    const departureStationEl = c.find(".origin-destination-station.segment-departure")
    CheerioParser.checkSingle(departureStationEl)
    train.DepartureStation = departureStationEl.text().trim()
    const arrivalTimeEl = c.find(".origin-destination-border.origin-destination-hour.segment-arrival")
    CheerioParser.checkSingle(arrivalTimeEl)
    train.ArrivalTime = this.extractVoyageTime(arrivalTimeEl.text())
    const arrivalStation = c.find(".origin-destination-border.origin-destination-station.segment-arrival")
    CheerioParser.checkSingle(arrivalStation)
    train.ArrivalStation = arrivalStation.text().trim()
    const typeSegmentEl = departureStationEl.next("td.segment")
    train.Type = typeSegmentEl.text().trim()
    const numberSegmentEl = typeSegmentEl.next("td.segment")
    train.Number = numberSegmentEl.text().trim()
    return train
  }

  private getVoyagePrice(c: Cheerio): Product.Price {
    const cells = c.find("td.cell")
    const priceCells = this.cheerioElsToCheerios(cells)
      .filter(el => {
        return el.text().indexOf("€") != -1
      })
    if (priceCells.length != 1) {
      throw "expected to find 1 price cell of a voyage, actually found " + priceCells.length + " cells"
    }
    const price = this.extractProductPrice(priceCells[0].text())
    return price
  }

  private getTravels(): Array<Travel.Travel> {
    const travelBlock = this.$("#block-travel")
    CheerioParser.checkSingle(travelBlock)
    const travelEls = this.cheerioElsToCheerios(travelBlock.find("div[id^=travel]"))
    let travels = new Array<Travel.Travel>()
    travelEls.forEach(t => travels.push(this.getTravel(t)))
    return travels
  }

  private getTravel(travelEl: Cheerio): Travel.Travel {
    const pnr = travelEl.find("table.block-pnr")
    CheerioParser.checkSingle(pnr)
    const pnrSummary = pnr.find("td.pnr-summary")
    CheerioParser.checkSingle(pnrSummary)
    if (!this.isTravelToGoToReturn(pnrSummary)) {
      throw "parsing of travels that are not to go and to return are not implemented yet"
    }
    let travel = new Travel.Travel()
    this.fillTravelDepartureDestination(pnrSummary, travel)
    this.fillTravelDates(pnrSummary, travel)
    return travel
  }

  private isTravelToGoToReturn(pnrSummary: Cheerio): boolean {
    if (pnrSummary.text().indexOf("<>") !== -1) {
      return true
    }
    return false
  }

  private fillTravelDepartureDestination(pnrSummary: Cheerio, travel: Travel.Travel) {
    const depDest = this.extractTravelToGoToReturnDepartureDestination(pnrSummary.text())
    if (depDest.length !== 2) {
      return "Departure-detination array length !== 2"
    }
    travel.Departure = depDest[0]
    travel.Destanation = depDest[1]
  }

  private fillTravelDates(pnrSummary: Cheerio, travel: Travel.Travel) {
    const travelDatesStrs = this.extractTravelDates(pnrSummary.text())
    const travelDates = travelDatesStrs.map(tds => {
      const parts = tds.split("/").map(p => Number(p))
      const date = new Date(Date.UTC(parts[2], parts[1] - 1, parts[0], 0, 0, 0, 0))
      return date
    })
    if (travelDates.length === 2) {
      travel.ToGoDate = travelDates[0]
      travel.ToReturnDate = travelDates[1]
      return
    }
    throw("did not expect to parse " + travelDates.length + " travel dates")
  }
}

export default CheerioParser