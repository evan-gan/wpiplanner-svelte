package com.google.gwt.xml.client;

public interface Element extends Node {
  String getAttribute(String name);

  NodeList getChildNodes();

  NodeList getElementsByTagName(String tagName);
}
