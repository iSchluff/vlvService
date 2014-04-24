var hapi = require('hapi');

var vlv= require("./vlv.js");
var data= require("./processEvents.js");
var routes= require("./routes.js");
var config= require("./config.js");

var server = hapi.createServer(config.hostString, 3000, {cors: true});

var defaultResponse= function(result, reply){
  result.then(function(result){
    reply(result);
  })
  .fail(function(error){
    console.error(error);
    reply("Failed running query\n");
  });
};

// Add the route
server.route([{
  method: 'GET',
  path: '/majors/{id?}',
  handler: function(req, reply) {
    var result;
    if (req.params.id) {
      result= data.queryDB({
        name: "getMajors",
        text: "SELECT id, major\
            FROM majors\
            WHERE $1 = id",
        values: [req.params.id]
      });
    }else{
      result= data.queryDB({
        name: "getMajor",
        text: "SELECT id, major\
            FROM majors",
        values: []
      });
    }
    defaultResponse(result, reply);
  }
},{
  method: 'GET',
  path: '/events/{id}',
  handler: function(req, reply) {
    var result= data.queryDB({
      name: "getEvent",
      text: "SELECT c.name, e.type, d.startTime, d.endTime, d.startDate, d.endDate, d.interval\
        FROM courses c\
        JOIN events e ON c.id = e.courseId\
        JOIN dates d ON d.event = e.id\
        WHERE $1 = e.id",
      values: [req.params.id]
    });
    defaultResponse(result, reply);
  }
},{
  method: 'GET',
  path: '/majorEvents/{id}',
  handler: function(req, reply) {
    console.log("date",req.query.date);
    var result;
    if(req.query.date){
      result= data.queryDB({
        name: "getMajorEventsOnDay",
        text: "SELECT c.name, c.lecturer, e.id, e.type, e.location, e.note, d.startTime, d.endTime\
          FROM majors m\
          JOIN eventMajors em ON em.majorId = m.id\
          JOIN events e ON e.id = em.eventId\
          JOIN courses c ON c.id = e.courseId\
          JOIN dates d ON d.event = e.id\
        WHERE ($1 = m.id) AND\
        (d.startDate <= $2 AND d.endDate >= $2) AND\
        ((d.startDate = d.endDate) OR\
        ((NOT d.interval = '0s'::interval) AND\
        floor(($2- d.startdate)/extract('epoch' from d.interval)*86400) =\
        ($2- d.startdate)/extract('epoch' from d.interval)*86400))",
        values: [req.params.id, req.query.date]
      });
    }else{
      result= data.queryDB({
        name: "getMajorEvents",
        text: "SELECT c.name, c.lecturer, e.id, e.type, e.location, e.note\
          FROM majors m\
          JOIN eventmajors em ON em.majorId = m.id\
          JOIN events e ON e.id = em.eventId\
          JOIN courses c ON c.id = e.courseId\
          WHERE $1 = m.id",
        values: [req.params.id]
      });
    }
    defaultResponse(result, reply);
  },
  config: {
    validate: {
      query:{
        date: hapi.types.date()
      }
    }
  },
},{
    method: 'GET',
    path: '/update',
    handler: function (request, reply) {
      if(request.info.remoteAddress !== "127.0.0.1"){
        var error = hapi.error.forbidden('Not for You');
        return reply(error);
      }

      var t= new Date().getTime();
      // load data from vlv and store in db
      vlv.getEvents()
      .then(function(val){
        console.log("Events Length:",val.length);
        return val;
      })
      .then(function(events){
        var d= data.processEvents(events);
        return data.saveEvents(d);
      })
      .then(function(){
        reply("Updated Database: "+ (new Date().getTime() - t) + " ms \n");
      })
      .fail(function(error){
        console.error(error);
        reply("Updating Database failed \n");
      });
    }
}
]);

// Start the server
server.start();
console.log("Started Server on Port 3000");
