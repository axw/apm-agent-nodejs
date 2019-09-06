'use strict'

var semver = require('semver')

var shimmer = require('../shimmer')

module.exports = function (aws, agent, { version, enabled }) {
  if (!enabled) {
    return aws
  }
  if (!semver.satisfies(version, '2.x')) {
    agent.logger.debug('AWS SDK version %s not supported - aborting...', version)
    return aws
  }

  aws.events.on('build', function (req) {
    const serviceId = req.service.constructor.prototype.serviceIdentifier
    const operation = req.operation
    const name = `Lambda.Invoke: ${req.params.FunctionName}`
    req._elasticApmSpan = agent.startSpan(name, `aws.${serviceId}.${operation}`)

    if (req.params.Payload && agent.lambda.injectHeaders) {
      const obj = JSON.parse(req.params.Payload)
      const headers = {'elastic-apm-traceparent': req._elasticApmSpan.traceparent}
      if (agent.lambda.injectHeaders(obj, headers)) {
        req.params.Payload = JSON.stringify(obj)
        agent.logger.debug("Injected trace headers into Lambda payload: %s", req.params.Payload)
      }
    }
  }).on('error', function (error, resp) {
    agent.captureError(error)
  }).on('httpError', function (error, resp) {
    agent.captureError(error)
  }).on('complete', function (resp) {
    if (resp.request._elasticApmSpan) {
      resp.request._elasticApmSpan.end()
      delete resp.request._elasticApmSpan
    }
  })
  return aws
}
