var http = require("http");
var Q= require("q");
var url= require("url");

String.prototype.degradeMatch= function(regex, id){
  var match= this.match(regex);
  return ( match && match.length > id ) ? match[id] : "";
};

var isTimespan= function(string){
  return string.match(/(\d{2}\.\d{2}|&nbsp;) - (\d{2}\.\d{2}|&nbsp;)/) !== null;
};

var isFs= function(string){
  return string.match(/\d.FS|Erg /) !== null || string === "";
};

var isDate= function(string){
  return string.match(/^nach Vereinbarung|\d{2}.\d{2}.\d{4}|KW/) !== null;
};

var days=["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
var isDay= function(string){
  return string === "" || days.indexOf(string) >= 0;
};

var assert= function(value, message){
  if(!value){
    console.error(new Error(message));
  }
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
  var deferred= Q.defer();

  var response= function(res){
    var string= "";
    res.setEncoding('binary');
    // console.log(res.headers);

    var parseEvents = function(){
      var events= [];

      console.timeEnd("getHtml");
      console.time("parseEvents");

      //split into lectures
      var arr=string.split(/<\/table>/);
      console.log("parts", arr.length);
      for(var i = 0; i < arr.length; i++){
        var part= arr[i];

        var nameParts= part.match(/(?:<b>(.*?)<|<p class="stupla_bold">(.*?)<)/);
        if(nameParts === null){ continue; }
        var name= nameParts[1] || nameParts[2];
        assert(name !== undefined, "nameMatch failed:\n" + part);

        var lecturerParts= part.match(/(?:<td colspan=6>(.*?)<|<p>([^&]*?)<)/);
        var lecturer= lecturerParts? lecturerParts[1] || lecturerParts[2] : "";
        assert(lecturer !== undefined, "lecturerMatch failed:\n" + part);

        var storetype="";

        //split into single events
        var eventArray= arr[i].split(/<tr valign=(?:top|"top")>/);
        for(var x=1; x < eventArray.length; x++){
          var eventString= eventArray[x];

          var type= eventString.match(/10%"?>(.*)(?::|;)/);
          if(type=== null){
            console.log();
            // console.log("skipping", lecturer);
            // console.log(eventString);
            continue;
          }
          type = (type[1] === "&nbsp") ? storetype : type[1];
          storetype= type;

          // Regex Table Cells
          var details= eventString.match(/(?:>)([\w \+\/\;\ö\ä\ü\b\.\Ü\Ö\Ä\-\&,\(\)]+)</g);

          // Try to bring details to length 5
          if(details[0] === ">&nbsp;<"){
            details.splice(0, 1);
          }

          if(details[0].match(/kein Angebot/)){
            continue;
          }

          if(details[1].match(/kein Angebot/)){
            continue;
          }

          // offset details by 2 if day and date are missing -> detect time position
          if(isTimespan(details[0])){
            details.unshift("","");
          }else if(isTimespan(details[1])){
            details.unshift("");
          }

          // insert empty location if location is missing
          // if(isFs(details[3])){
          //   details.splice(3, 0, "");
          // }

          // strip empty fields at the end
          // if(details.length > 5){
          //   var test= true;
          //   for(var t=5; t< details.length; t++){
          //     if(details[t].match(">(|&nbsp;|Zur&uuml;ck zur Startseite)<") === null){
          //       test= false;
          //       break;
          //     }
          //   }
          //   if(test){
          //     details.splice(5, details.length - 5);
          //   }
          // }

          for(var k= details.length; k<5; k++){
            details.push("");
          }



          var tested= false;
          if(isDate(details[1]) ||
             details[1].match(/nach Vereinbarung/) !== null){
              tested=true;
           }

          if(tested){
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

            assert(isDay(event.day), "dayMatch "+event.day);
            assert(isDate(event.date), "dateMatch "+event.date);
            assert(isTimespan(event.timespan), "timespanMatch "+event.timespan);
            assert(isFs(event.fs), "fsMatch "+event.fs);

            events.push(event);
          }else{
            console.error("\nFailed parsing event");
            console.log("isFs",isFs(details[4]),
            "isDate", isDate(details[1]) || details[1].match(/nach Vereinbarung/) !== null);

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
  // build url with get parameters, % suchen für alle ergebnisse
  // sommer    http://wcms3.rz.tu-ilmenau.de/~goettlich/elvvi/sommer/list/fachsuch_so.php?suchfach=%
  var dataURL= url.parse("http://localhost/vlvSommer.html");
  var options= {
    hostname: dataURL.hostname,
    path: dataURL.path,
    headers: {
        'Content-Type': 'text/html;charset=utf-8',
    }
  };

  http.get(options, response).on('error', function(e) {
    console.log("getEvents Error: " + e.message);
  });

  return deferred.promise;
};
