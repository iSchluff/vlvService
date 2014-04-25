var pg = require('pg').native,
Q= require("q"),
config= require("./config.js");
//_= require("lodash"),

var localTime= new Date();

Date.prototype.getWeek = function() {
  var fjan = new Date(this.getFullYear(), 0, 4);
  return Math.ceil((((this - fjan) / 86400000) + fjan.getDay()+1)/7);
};

Date.prototype.yyyymmdd = function() {
 var yyyy = this.getFullYear().toString();
 var mm = (this.getMonth()+1).toString(); // getMonth() is zero-based
 var dd  = this.getDate().toString();
 return yyyy +"-"+ (mm[1]?mm:"0"+mm[0]) +"-"+ (dd[1]?dd:"0"+dd[0]); // padding
};

var getDate = function(week, day, year) {
  year= year || new Date().getFullYear();
  var simple = new Date(year, 0, 1 + (week - 1) * 7);
  var date = simple;
  date.setDate(simple.getDate() - simple.getDay() + day +
              (simple.getDay() <= 4 ? 1 : 8));
  return date;
};

var toDay= function(s){
  return ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"].indexOf(s);
};

// convert calendar-week notation to dates
var matchDate = function(string, day, year){
  var weekMatch= string.match(/(\d{1,2})(\.|)/);
  if(weekMatch=== null){
    return new Error("Can't match week! str: " +string+
                     " matches: " +weekMatch);
  }
  return getDate(
    Number(weekMatch[1]),
    toDay(day),
    year)
    .yyyymmdd();
};

// converts different timeformats into a list of timespans
var processDate= function(dateString, dayString){
  var timespans= [],
  note= "";

  // try to match dd.mm.yyyy dates
  var dateMatch= dateString.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if(dateMatch){
    timespans.push(dateMatch[3]+"-"+dateMatch[2]+"-"+dateMatch[1]);

  // try to match complex timespans (xx. KW)
  }else if(dateString.indexOf(".") !== -1){

    // check for U or G weeks
    var match= dateString.match(/^(?:(U|G)).+/);
    var recurring= match ? 2: 1;
    if(match){
      dateString= dateString.slice(3, -1);
    }

    // split by ';' and ',' and then by '-'
    var commaSplit= dateString.split(/[,;] /);

    for(var i=0; i < commaSplit.length; i++){
      var hyphenSplit= commaSplit[i].split(/(?: |)- /);

      // extract week / years from parts
      var dates=[];

      // exactly 2 hyphens
      if(hyphenSplit.length <= 2){
        for(var j=0; j < hyphenSplit.length; j++){
          var yearMatch= hyphenSplit[j].match(/(\d{4})/);
          for(var x= i; yearMatch === null && x < commaSplit.length; x++){
            yearMatch= commaSplit[x].match(/(\d{4})/);
          }

          if(yearMatch === null){
            if(localTime.getMonth() > 2 && localTime.getMonth() < 9){ //sommersemester

              yearMatch= [, localTime.getFullYear()];
            }else{
              return new Error("Missing Year -> "+ dateString);
            }
          }

          var m= matchDate(hyphenSplit[j], dayString, yearMatch[1]);
          if(m instanceof Error){ return m; }
          dates.push(m);
        }
      }else if(hyphenSplit.length === 3){
        var m1= matchDate(hyphenSplit[0], dayString);
        if(m1 instanceof Error){ return m1; }

        var m2= matchDate(hyphenSplit[2], dayString);
        if(m2 instanceof Error){ return m2; }

        dates.push(m1, m2);

      }else{
        return new Error("Couldn't parse Timespan -> " + commaSplit[i]);
      }

      if(dates.length>2){
        console.log("-----------",dateString,"-------", split.length);
        console.log(dates);
      }

      if(dates.length>1){ dates.push(recurring); }
      timespans.push(dates);
    }
  }else{
    note= dateString;
  }
  if(typeof timespans === "string"){
    console.log(dateString, dayString, timespans);
  }
  return {
    timespans: timespans,
    note: note
  };
};

var processTimes= function(timeString){
  var split= timeString.split(" - ");
  if( split.length !== 2){
    return new Error("Wrong time format: "+timeString);
  }
  var times= [];
  for(var i=0; i<split.length; i++){
    var match= split[i].match(/(\d{2})\.(\d{2})/);
    if(match){ times.push(match[1]+":"+match[2]); }
  }
  return times;
};

// bring the event to a default format, return null for non-standard formats
var processEvent = function(event){
  var dates= processDate(event.date, event.day);
  if(dates instanceof Error){ return dates; }

  var times= processTimes(event.timespan);
  if(times instanceof Error){ return times; }

  var fs= event.fs.split(", ");
  return {
    courseName: event.name,
    courseLecturer: event.lecturer,

    data: {
      type: event.type,
      location: event.location,
      dates: dates.timespans,
      times: times,
      fs: fs,
      note: dates.note,
    }
  };
};

// run through list of events -> format before writing to database
exports.processEvents= function(events){
  var data= [],
  course= {},
  first= true;

  localTime= new Date();

  console.time("processEvents");

  for(var i=0; i<events.length; i++){
    var event= processEvent(events[i]);

    if(event instanceof Error){
      console.error(event);
      console.log(events[i]);
      continue;
    }

//    fsJoin.push.apply(fsJoin, event.data.fs)

    // accumulate events of the same events to one dataset
    // Assumption: sorted events
    if(event.courseName !== course.name){
      if(first){
        first= false;
      }else{
        data.push(course);
      }
      course= {
        name: event.courseName,
        lecturer: event.courseLecturer,
        events: [],
      };
    }
    course.events.push(event.data);
  }

  data.push(course);

  console.timeEnd("processEvents");
//  console.log("huhu",fsJoin.length);
  return data;
};

// promise based query
var query= function(client, prepared){
  var deferred= Q.defer(),
  query= client.query(prepared),
  reference= this;

  query.on("row", function(row, result){
    result.addRow(row);
  });
  query.on("error", function(error){
    deferred.reject(error);
  });
  query.on("end", function(result){
    deferred.resolve({
      ref: reference,
      value: result,
    });
  });

  return deferred.promise;
};

// send formatted events to postgres
exports.saveEvents= function(data){
  var deferred= Q.defer();
  var client = new pg.Client(config.pgString);

  // connect to postgres
  client.connect(function(err) {
    if(err) {
      deferred.reject("Could not connect to Database");
      return console.error('could not connect to postgres', err);
    }
    console.log("connected to db");

    var insertDates= function(eventResult){
      var eventId= eventResult.value.rows[0].id,
      event= eventResult.ref,
      results= [];

      event.dates.forEach(function(date){
        if(typeof date === "string"){
          date= [date];
        }
        var interval= date.length > 2 ? date[2] : 0;
        var endDate= date.length > 1 ? date[1] : date[0];
        var result= query.call(date, client, {
          name: "insertDate",
          text: "INSERT INTO\
                dates (startDate, endDate, startTime, endTime, interval, event)\
                VALUES($1, $2, $3, $4, $5, $6)",
          values: [date[0], endDate, event.times[0], event.times[1], interval+" W", eventId]
        });
        results.push(result);
      });
      return Q.all(results);
    };

    var insertEventMajors= function(majorResult){
      var majorId= majorResult.value.rows[0].id,
      event= majorResult.ref;

      var result= query.call(event, client, {
        name: "insertEventMajor",
        text: "INSERT INTO\
               eventmajors (eventid, majorid)\
               VALUES($1, $2)",
        values: [event.id, majorId],
      });

      return result;
    };

    var insertMajors= function(eventResult){
      var eventId= eventResult.value.rows[0].id,
      event= eventResult.ref,
      results= [];

      event.id= eventId;

      event.fs.forEach(function(major){
        var result= query.call(event, client, {
          name: "insertMajor",
          text: "WITH s AS ( \
                SELECT id, major\
                FROM majors\
                WHERE major= $1\
                )\
                ,i AS ( INSERT INTO majors(major)\
                SELECT $1\
                WHERE NOT EXISTS (SELECT 1 FROM s)\
                RETURNING id, major\
                )\
                SELECT id, major\
                FROM i\
                UNION ALL\
                SELECT id, major\
                FROM s",
          values: [major]
        })
        .then(insertEventMajors);
        results.push(result);
      });
      return Q.all(results);
    };

    var onEventInsert= function(eventResult){
      var results= [insertDates(eventResult), insertMajors(eventResult)];
      return Q.all(results);
    };

    var insertEvents= function(courseResult){
      var courseId= courseResult.value.rows[0].id,
      course= courseResult.ref,
      results= [];

      course.events.forEach(function(event){
        var result= query.call(event, client, {
          name: "insertEvent",
          text: "INSERT INTO\
                events (type, location, note, courseId)\
                VALUES($1, $2, $3, $4)\
                RETURNING id",
          values: [event.type, event.location, event.note, courseId]
        })
        .then(onEventInsert);
        results.push(result);
      });
      return Q.all(results);
    };

    var insertCourses= function(){
      var results= [];
      data.forEach(function(course){
        var result= query.call(course, client, {
          name: "insertCourse",
          text: "INSERT INTO\
                 courses (name, lecturer)\
                 VALUES($1, $2)\
                 RETURNING id",
          values: [course.name, course.lecturer]
        })
        .then(insertEvents);
        results.push(result);
      });
      return Q.all(results);
    };

    query(client, {
      name: "clearTables",
      text: "TRUNCATE courses, majors RESTART IDENTITY CASCADE"
    }).then(function(){
      console.log("cleared db");
      return insertCourses();
    })
    .then(function(){
      console.log("disconnecting from db");
      client.end();
      deferred.resolve("");
    })
    .fail(function(error){
      console.error(error.stack);
      client.end();
      deferred.reject("Failed running Query");
    });
  });

  return deferred.promise;
};

exports.queryDB= function(queryObject){
  var client = new pg.Client(config.pgString);
  var deferred= Q.defer();

  // connect to postgres
  client.connect(function(err) {
    if(err) { return console.error('could not connect to postgres', err); }

    query(client, queryObject)
    .then(function(result){
      client.end();
      deferred.resolve(result.value.rows);
    })
    .fail(function(err){
      client.end();
      deferred.reject(new Error('Failed running query - '+ err));
    });
  });

  return deferred.promise;
};
