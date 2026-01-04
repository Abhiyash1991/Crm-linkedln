const express = require('express');
const router = express.Router();
const dbPromise = require('../db/database');
const { v4: uuidv4 } = require('uuid');

let db;
dbPromise.then(database => { db = database; });

// Get all pipeline stages with contact counts
router.get('/stages', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const stages = db.prepare(`
      SELECT
        ps.*,
        COUNT(c.id) as contact_count
      FROM pipeline_stages ps
      LEFT JOIN contacts c ON c.pipeline_stage = ps.name
      GROUP BY ps.id
      ORDER BY ps.display_order
    `).all();

    res.json(stages);
  } catch (error) {
    console.error('Error fetching stages:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline stages' });
  }
});

// Get pipeline view (contacts grouped by stage)
router.get('/view', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const stages = db.prepare('SELECT * FROM pipeline_stages ORDER BY display_order').all();

    const pipeline = stages.map(stage => {
      const contacts = db.prepare(`
        SELECT * FROM contacts
        WHERE pipeline_stage = ?
        ORDER BY updated_at DESC
      `).all(stage.name);

      return {
        ...stage,
        contacts
      };
    });

    res.json(pipeline);
  } catch (error) {
    console.error('Error fetching pipeline view:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline view' });
  }
});

// Move contact to different stage
router.post('/move', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { contact_id, from_stage, to_stage } = req.body;

    if (!contact_id || !to_stage) {
      return res.status(400).json({ error: 'Contact ID and target stage are required' });
    }

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Verify target stage exists
    const stage = db.prepare('SELECT * FROM pipeline_stages WHERE name = ?').get(to_stage);
    if (!stage) {
      return res.status(400).json({ error: 'Invalid pipeline stage' });
    }

    // Update contact stage
    db.prepare(`
      UPDATE contacts
      SET pipeline_stage = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(to_stage, contact_id);

    // Log activity
    db.prepare(`
      INSERT INTO activities (id, contact_id, activity_type, description)
      VALUES (?, ?, 'stage_change', ?)
    `).run(uuidv4(), contact_id, `Moved from "${contact.pipeline_stage}" to "${to_stage}"`);

    const updatedContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id);
    res.json(updatedContact);
  } catch (error) {
    console.error('Error moving contact:', error);
    res.status(500).json({ error: 'Failed to move contact' });
  }
});

// Create custom pipeline stage
router.post('/stages', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { name, color = '#6366f1' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Stage name is required' });
    }

    // Get max display order
    const maxOrder = db.prepare('SELECT MAX(display_order) as max_order FROM pipeline_stages').get();
    const displayOrder = (maxOrder.max_order || 0) + 1;

    const id = uuidv4();
    db.prepare(`
      INSERT INTO pipeline_stages (id, name, display_order, color)
      VALUES (?, ?, ?, ?)
    `).run(id, name, displayOrder, color);

    const stage = db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(id);
    res.status(201).json(stage);
  } catch (error) {
    console.error('Error creating stage:', error);
    res.status(500).json({ error: 'Failed to create pipeline stage' });
  }
});

// Update pipeline stage
router.put('/stages/:id', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;
    const { name, color, display_order } = req.body;

    const existing = db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);

      // Also update contacts with this stage
      db.prepare('UPDATE contacts SET pipeline_stage = ? WHERE pipeline_stage = ?').run(name, existing.name);
    }

    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }

    if (display_order !== undefined) {
      updates.push('display_order = ?');
      params.push(display_order);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(id);
    db.prepare(`UPDATE pipeline_stages SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const stage = db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(id);
    res.json(stage);
  } catch (error) {
    console.error('Error updating stage:', error);
    res.status(500).json({ error: 'Failed to update pipeline stage' });
  }
});

// Delete pipeline stage
router.delete('/stages/:id', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;
    const { move_to_stage } = req.body;

    const existing = db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    // Check if there are contacts in this stage
    const contactCount = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE pipeline_stage = ?').get(existing.name);

    if (contactCount.count > 0) {
      if (!move_to_stage) {
        return res.status(400).json({
          error: `Cannot delete stage with ${contactCount.count} contacts. Provide move_to_stage parameter.`
        });
      }

      // Move contacts to new stage
      db.prepare('UPDATE contacts SET pipeline_stage = ? WHERE pipeline_stage = ?').run(move_to_stage, existing.name);
    }

    db.prepare('DELETE FROM pipeline_stages WHERE id = ?').run(id);
    res.json({ message: 'Stage deleted successfully' });
  } catch (error) {
    console.error('Error deleting stage:', error);
    res.status(500).json({ error: 'Failed to delete pipeline stage' });
  }
});

// Reorder stages
router.post('/stages/reorder', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { stage_order } = req.body;

    if (!Array.isArray(stage_order)) {
      return res.status(400).json({ error: 'stage_order must be an array of stage IDs' });
    }

    stage_order.forEach((stageId, index) => {
      db.prepare('UPDATE pipeline_stages SET display_order = ? WHERE id = ?').run(index + 1, stageId);
    });

    const stages = db.prepare('SELECT * FROM pipeline_stages ORDER BY display_order').all();
    res.json(stages);
  } catch (error) {
    console.error('Error reordering stages:', error);
    res.status(500).json({ error: 'Failed to reorder stages' });
  }
});

module.exports = router;
