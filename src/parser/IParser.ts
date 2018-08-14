import * as ParsedTicket from '../ParsedTicket'

interface IParser {
  Parse(path: Buffer): Promise<ParsedTicket.ParsedTicket> 
}

export default IParser