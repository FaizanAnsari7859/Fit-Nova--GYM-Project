import { ApiError } from '../utils/apiError.js';
import { pick } from '../utils/pick.js';

export const createCrudController = (Model, fields) => ({
  create: async (req, res) => {
    const record = await Model.create(pick(req.body, fields));
    res.status(201).json({ success: true, data: record });
  },

  list: async (req, res) => {
    const records = await Model.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: records });
  },

  getOne: async (req, res) => {
    const record = await Model.findById(req.params.id);

    if (!record) {
      throw new ApiError(404, 'Record not found.');
    }

    res.status(200).json({ success: true, data: record });
  },

  update: async (req, res) => {
    const record = await Model.findByIdAndUpdate(req.params.id, pick(req.body, fields), {
      new: true,
      runValidators: true,
    });

    if (!record) {
      throw new ApiError(404, 'Record not found.');
    }

    res.status(200).json({ success: true, data: record });
  },

  remove: async (req, res) => {
    const record = await Model.findByIdAndDelete(req.params.id);

    if (!record) {
      throw new ApiError(404, 'Record not found.');
    }

    res.status(200).json({ success: true, message: 'Record deleted.' });
  },
});
