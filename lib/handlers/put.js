var Response = require('../../messages/protocol_buffers').Response;
var PutResponse = require('../../messages/protocol_buffers').PutResponse;
var agent = require('auth0-instrumentation');
var tags = { method: 'PUT' };

function build_put_response (protocol, message, bucket) {
  if (protocol === 'protocol-buffers') {
    var response = new Response({
      request_id: message.id,
    });

    var takeResponse = new PutResponse({
      remaining: Math.floor(bucket.content),
      reset: bucket.reset,
      limit: bucket.size
    });

    response.set('.limitd.PutResponse.response', takeResponse);

    return response;
  } else {
    return {
      request_id: message.id,
      body: {
        'limitd.PutBody': {
          bucket: {
            remaining: Math.floor(bucket.content),
            reset: bucket.reset,
            limit: bucket.size
          }
        }
      },
    };
  }
}

module.exports.handle = function (buckets, log, protocol, message, done) {
  agent.metrics.increment('requests.incoming', 1, tags);

  var bucket_type = buckets.get(message['type']);

  log.debug({
    method:  'PUT',
    'type': message['type'],
    key:     message.key,
    count:   message.count
  }, 'adding tokens');

  var start = new Date();

  bucket_type.putToken(message.key, message.all || message.count, function (err, bucket) {
    if (err) {
      agent.metrics.increment('requests.processed', 1, tags);
      agent.metrics.histogram('response.time', (new Date() - start), tags);
      var errorContext = {
        err:    err,
        method: 'PUT',
        'type': message['type'],
        key:    message.key,
        count:  message.count,
        all:    message.all,
      };
      agent.errorReporter.captureException(err.message, { extra: errorContext });
      return log.error(errorContext, err.message);
    }

    log.info({
      err:        err,
      method:     'PUT',
      'type':     message['type'],
      key:        message.key,
      count:      message.count,
      all:        message.all,
      remaining:  Math.floor(bucket.content) || 0,
      limit:      bucket.size,
      took:       new Date() - start,
      beforeDrip: bucket.beforeDrip,
      isNew:      bucket.isNew,
    }, 'PUT/RESET');

    var result = build_put_response (protocol, message, bucket);
    agent.metrics.increment('requests.processed', 1, tags);
    agent.metrics.histogram('response.time', (new Date() - start), tags);
    done(null, result);
  });
};