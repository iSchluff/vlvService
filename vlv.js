var http = require("http");
var Q= require("q");

String.prototype.degradeMatch= function(regex, id){
  var match= this.match(regex);
  return ( match && match.length > id ) ? match[id] : "";
};

var isTimespan= function(string){
  return string.match(/(\d{2}\.\d{2}|&nbsp;) - (\d{2}\.\d{2}|&nbsp;)/) !== null;
};

var isFs= function(string){
  return string.match(/\d.FS \d/) !== null;
};


/* example event structure:
 * 
 * { name: 'Effiziente Algorithmen',
 * lecturer: 'Prof. Dietzfelbinger, Fak. IA',
 * type: 'Übung',
 * day: 'Mittwoch',
 * date: '42., 44. KW 2013',
 * timespan: '15.00 - 16.30',
 * location: 'Sr HU 011',
 * fs: 'IN_MA 1.FS 1 IHS, IN_MA 1.FS 2 MIVR' }
 * 
 * */
exports.getEvents = function(){
  // build url with get parameters, % suchen für alle ergebnisse
//  var url="http://wcms3.rz.tu-ilmenau.de/~goettlich/elvvi/winter/list/fachsuch_ws.php?suchfach=%";
  var url="http://local/vlv6.html";
  
  var deferred= Q.defer();
  
  var response= function(res){
    var string= "";
    
    var parseEvents = function(){
      var events= [];
      
      console.timeEnd("getHtml");
      console.time("parseEvents");
      //split into lectures
      var arr=string.split(/<table border=1 width=100% cellspacing=0>/);
      for(var i = 0; i < arr.length; i++){

        var part= arr[i];
        
        var name= part.match(/<b>(.*?)<\/b>/)[1];
        var lecturer= part.degradeMatch(/<td colspan=6>(.*?)<\/td>/, 1);
        
        var storetype="";
        
        //split into single events
        var eventArray= arr[i].split(/<tr valign=top>/);
        for(var x=3; x < eventArray.length; x++){
          var eventString= eventArray[x];
          
          var type= eventString.match(/10%>(.*)(:|;)/);
          if(type=== null){
            console.log();
            console.log("skipping", lecturer);
            console.log(eventString);
//            console.log(eventArray);
            continue;
          }
          type = (type[1] === "&nbsp") ? storetype : type[1];
          storetype= type;
          
          // Regex Table Cells
          var details= eventString.match(/(>|: )([\w \+\/\;\ö\ä\ü\b\.\Ü\Ö\Ä\-\&,\(\)]*)</g);
          
          // Try to bring details to length 5
          if(details[0] === ">&nbsp;<"){
            details.splice(0, 1);
          }
          
          // offset details by 2 if day and date are missing -> detect time position
          if(isTimespan(details[0])){
            details.unshift("","");
          }else if(isTimespan(details[1])){
            details.unshift("");
          }
          
          // insert empty location if location is missing
          if(isFs(details[3])){
            details.splice(3, 0, "");
          }
          
          // strip empty fields at the end
          if(details.length > 5){
            var test= true;
            for(var t=5; t< details.length; t++){
              if(details[t].match(">(|&nbsp;|Zur&uuml;ck zur Startseite)<") === null){
                test= false;
                break;
              }
            }
            if(test){
              details.splice(5, details.length - 5);
            }
          }
          
          if(details && details.length === 5){
            type= type.replace(/en/, "").replace(/ne/, "n").replace(/ka/,"kum").replace(/e$/, "");
            
            // base Index
            var event= {
              name: name,
              lecturer: lecturer,
              type: type,
              day: details[0].slice(1,-1),
              date: details[1].slice(1,-1),
              timespan: details[2].slice(1,-1),
              location: details[3].slice(1,-1),
              fs: details[4].slice(1,-1)
            };
            
            for (var property in event) {
              if (event.hasOwnProperty(property) && event[property] === "&nbsp;") {
                event[property] = "";
              }
            }
            
            if(isTimespan(event.timespan)){
              events.push(event);
            }else{
              console.error("\nFailed parsing event");
              console.log(eventArray[x]);
              console.log("details:",details, details.length);
              console.log("info:", name, lecturer, type);
            }
            
          }else{
            console.error("\nFailed parsing event");
            console.log(eventArray[x]);
            console.log("details:",details, details.length);
            console.log("info:", name, lecturer, type);
          }
        }
      }
      console.timeEnd("parseEvents");
      deferred.resolve(events);
    };
    
    //Build page from chunked responses
    res.on("data", function(chunk){
      string+= chunk;
    });
    
    //Parse page string
    res.on("end", parseEvents);
  };
  
  console.time("getHtml");
  http.get(url, response).on('error', function(e) {
    console.log("getEvents Error: " + e.message);
  });
  
  return deferred.promise;  
};
