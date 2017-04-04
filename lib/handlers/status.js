var Response = require('../../messages/protocol_buffers').Response;
var StatusResponse = require('../../messages/protocol_buffers').StatusResponse;
var agent = require('auth0-instrumentation');
var tags = { method: 'STATUS' };

function build_status_response (protocol, message, items) {
  if (protocol === 'protocol-buffers') {
    var response = new Response({
      request_id: message.id,
    });

    var statusResponse = new StatusResponse({
      items: items.map(function (r) {
        return {
          remaining: Math.floor(r.content),
          reset: r.reset,
          limit: r.size,
          instance: r.instance
        };
      })
    });


    response.set('.limitd.StatusResponse.response', statusResponse);
    return response;
  } else {
    return {
      request_id: message.id,
      body: {
        'limitd.StatusBody': {
          items: items.reduce(function (result, r) {
            result[r.instance] = {
              remaining: Math.floor(r.content),
              reset: r.reset,
              limit: r.size,
            };
            return result;
          }, {})
        }
      },
    };
  }
}

module.exports.handle = function (buckets, log, protocol, message, done) {
  agent.metrics.increment('requests.incoming', 1, tags);

  var bucket_type = buckets.get(message['type']);

  log.info({
    method:  'STATUS',
    type:    message.type,
    key:     message.key,
    query:   message.query
  }, 'starting an STATUS query');

  var start = new Date();

  bucket_type.status(message.key, function (err, items) {
    if (err) {
      agent.metrics.increment('requests.processed', 1, tags);
      agent.metrics.histogram('response.time', (new Date() - start), tags);
      var errorContext = {
        method:     'STATUS',
        'type':     message['type'],
        key:        message.key,
        took:       new Date() - start,
        err: err
      };
      agent.errorReporter.captureException(err.message, { extra: errorContext });
      return log.error(errorContext);
    }

    log.info({
      method:     'STATUS',
      'type':     message['type'],
      key:        message.key,
      took:       new Date() - start
    }, 'STATUS');

    var result = build_status_response(protocol, message, items);
    agent.metrics.increment('requests.processed', 1, tags);
    agent.metrics.histogram('response.time', (new Date() - start), tags);
    done(null, result);
  });
};