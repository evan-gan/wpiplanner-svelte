package oracle;

import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Node;
import com.google.gwt.xml.client.NodeList;

/**
 * Adapts a JDK org.w3c.dom tree to the GWT XML interfaces.
 *
 * This exists so `SchedXMLParser` can run unmodified: the browser build hands it
 * a GWT Document, and this hands it the same shape over a JDK-parsed one. Only
 * the four methods the parser actually calls are bridged.
 */
final class W3cXml {

  private W3cXml() {}

  static Document document(org.w3c.dom.Document document) {
    return new DocumentAdapter(document);
  }

  private static final class DocumentAdapter implements Document {
    private final org.w3c.dom.Document document;

    DocumentAdapter(org.w3c.dom.Document document) {
      this.document = document;
    }

    @Override
    public NodeList getElementsByTagName(String tagName) {
      return new NodeListAdapter(document.getElementsByTagName(tagName));
    }
  }

  private static final class ElementAdapter implements Element {
    private final org.w3c.dom.Element element;

    ElementAdapter(org.w3c.dom.Element element) {
      this.element = element;
    }

    @Override
    public String getAttribute(String name) {
      return element.getAttribute(name);
    }

    @Override
    public NodeList getChildNodes() {
      return new NodeListAdapter(element.getChildNodes());
    }

    @Override
    public NodeList getElementsByTagName(String tagName) {
      return new NodeListAdapter(element.getElementsByTagName(tagName));
    }
  }

  private static final class NodeListAdapter implements NodeList {
    private final org.w3c.dom.NodeList nodes;

    NodeListAdapter(org.w3c.dom.NodeList nodes) {
      this.nodes = nodes;
    }

    @Override
    public int getLength() {
      return nodes.getLength();
    }

    @Override
    public Node item(int index) {
      org.w3c.dom.Node node = nodes.item(index);
      if (node instanceof org.w3c.dom.Element) {
        return new ElementAdapter((org.w3c.dom.Element) node);
      }
      // The parser casts every child to Element. The export has no whitespace
      // between tags, so this should never be reached; fail loudly if it is.
      throw new IllegalStateException("Unexpected non-element node: " + node.getNodeName());
    }
  }
}
