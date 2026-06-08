const { sendError } = require('../utils/httpError');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params
    });

    if (!result.success) {
      return sendError(
        res,
        400,
        '입력값을 확인해주세요.',
        'VALIDATION_ERROR',
        result.error.flatten()
      );
    }

    req.validated = result.data;
    return next();
  };
}

module.exports = { validate };
